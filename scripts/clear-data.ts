import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import {
  DynamoDBClient,
  ScanCommand,
  BatchWriteItemCommand,
  type WriteRequest
} from "@aws-sdk/client-dynamodb";
import { resolveAwsEndpoint, resolveAwsRegion, shouldForcePathStyle } from "../packages/node-utils/src";

const region = resolveAwsRegion();
const s3Endpoint = resolveAwsEndpoint("s3");
const dynamoEndpoint = resolveAwsEndpoint("dynamodb");

const narrativeBucket = requireEnv("NARRATIVE_S3_BUCKET");
const narrativePrefix = process.env.NARRATIVE_S3_PREFIX ?? "";
const worldIndexTable = requireEnv("NARRATIVE_DDB_TABLE");
const locationIndexTable = requireEnv("LOCATION_GRAPH_DDB_TABLE");

async function main() {
  console.log("Clearing persistence stores in %s", region);
  await clearS3({ bucket: narrativeBucket, prefix: narrativePrefix });
  await clearDynamo(worldIndexTable, "world");
  await clearDynamo(locationIndexTable, "location");
  console.log("Done");
}

async function clearS3(options: { bucket: string; prefix?: string }) {
  const client = new S3Client({
    endpoint: s3Endpoint,
    forcePathStyle: shouldForcePathStyle(),
    region
  });
  const prefix = options.prefix?.replace(/^\/+|\/+$/g, "");
  console.log(
    "Clearing S3 bucket=%s prefix=%s",
    options.bucket,
    prefix && prefix.length > 0 ? prefix : "<root>"
  );

  let continuationToken: string | undefined;
  let deleted = 0;
  do {
    const list = await client.send(
      new ListObjectsV2Command({
        Bucket: options.bucket,
        Prefix: prefix && prefix.length > 0 ? `${prefix}/` : undefined,
        ContinuationToken: continuationToken
      })
    );

    const objects = list.Contents ?? [];
    if (objects.length > 0) {
      const chunks: typeof objects[] = [];
      for (let i = 0; i < objects.length; i += 1000) {
        chunks.push(objects.slice(i, i + 1000));
      }
      for (const chunk of chunks) {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: options.bucket,
            Delete: {
              Objects: chunk
                .filter((entry) => Boolean(entry.Key))
                .map((entry) => ({ Key: entry.Key! }))
            }
          })
        );
        deleted += chunk.length;
      }
    }

    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (continuationToken);

  console.log("Deleted %d S3 objects", deleted);
}

async function clearDynamo(tableName: string, label: string) {
  const client = new DynamoDBClient({
    endpoint: dynamoEndpoint,
    region
  });
  console.log("Clearing DynamoDB table=%s (%s)", tableName, label);

  let lastEvaluatedKey: Record<string, any> | undefined;
  let removed = 0;
  do {
    const scan = await client.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: "#pk, #sk",
        ExpressionAttributeNames: {
          "#pk": "pk",
          "#sk": "sk"
        },
        ExclusiveStartKey: lastEvaluatedKey
      })
    );

    const items = scan.Items ?? [];
    if (items.length > 0) {
      const batches: WriteRequest[][] = [];
      for (let i = 0; i < items.length; i += 25) {
        batches.push(items.slice(i, i + 25).map((item) => ({
          DeleteRequest: {
            Key: {
              pk: item.pk,
              sk: item.sk
            }
          }
        })));
      }
      for (const batch of batches) {
        await client.send(
          new BatchWriteItemCommand({
            RequestItems: {
              [tableName]: batch
            }
          })
        );
        removed += batch.length;
      }
    }

    lastEvaluatedKey = scan.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log("Deleted %d DynamoDB items from %s", removed, tableName);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

main().catch((error) => {
  console.error("Failed to clear persistence stores", error);
  process.exit(1);
});
