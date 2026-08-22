import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

export const loadOpenAiApiKeyFromSecrets = async (
  client = new SecretsManagerClient({})
): Promise<void> => {
  const openAiApiKey = await loadSecret(
    client,
    process.env.OPENAI_API_KEY_SECRET_ARN,
    'OPENAI_API_KEY_SECRET_ARN'
  );
  process.env.OPENAI_API_KEY = openAiApiKey;
};

const loadSecret = async (
  client: SecretsManagerClient,
  secretArn: string | undefined,
  secretArnName: string
): Promise<string> => {
  if (secretArn === undefined || secretArn.trim().length === 0) {
    throw new Error(`${secretArnName} must be configured for the narrative Lambda.`);
  }
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: secretArn })
  );
  if (response.SecretString === undefined || response.SecretString.trim().length === 0) {
    throw new Error(`Secret ${secretArnName} did not contain a string value.`);
  }
  return response.SecretString;
};
