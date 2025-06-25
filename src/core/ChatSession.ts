export class ChatSession {
  private messages: { role: string; content: string }[] = [];

  addMessage(role: "user" | "assistant", content: string) {
    this.messages.push({ role, content });
  }

  getContext(): string {
    return this.messages.map(m => `${m.role}: ${m.content}`).join("\n");
  }

  getMessages(): { role: string; content: string }[] {
    return [...this.messages];
  }

  reset() {
    this.messages = [];
  }

  getLastMessage(): { role: string; content: string } | null {
    return this.messages.length > 0 ? this.messages[this.messages.length - 1] : null;
  }

  getMessageCount(): number {
    return this.messages.length;
  }
} 