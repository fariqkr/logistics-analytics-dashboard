import ChatInterface from "@/components/chat/ChatInterface";

export default function ChatPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Ask the Data</h1>
        <p className="text-sm text-slate-500">
          Natural-language questions → AI router picks a tool → deterministic
          engine computes the answer. Every response is fully explained.
        </p>
      </div>
      <ChatInterface />
    </div>
  );
}
