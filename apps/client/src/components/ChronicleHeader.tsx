import { useChronicleStore } from "../stores/chronicleStore";

const formatStatus = (state: string): string => {
  switch (state) {
    case "connecting":
      return "Connecting to the narrative engine...";
    case "connected":
      return "Connected to the narrative engine.";
    case "error":
      return "Connection interrupted. Please retry.";
    case "closed":
      return "Chronicle has been closed.";
    default:
      return "Idle.";
  }
};

export function ChronicleHeader() {
  const transportError = useChronicleStore((state) => state.transportError);
  const chronicleRecord = useChronicleStore((state) => state.chronicleRecord);
  const connectionState = useChronicleStore((state) => state.connectionState);
  const statusText = formatStatus(connectionState);
  return (
    <>
      <header className="chat-header">
        <h2 className="chat-title">
          {chronicleRecord?.title?.trim() ? chronicleRecord.title : "Unknown Chronicle"}
        </h2>
      </header>
      <div className="chat-status" role="status" aria-live="polite" data-testid="chat-status">
        {statusText}
      </div>
      {transportError ? (
        <p className="chat-error" role="alert" data-testid="chat-error">
          {typeof transportError.message === "string"
            ? transportError.message
            : "An unexpected connection issue occurred."}
        </p>
      ) : null}
      </>
  );
}
