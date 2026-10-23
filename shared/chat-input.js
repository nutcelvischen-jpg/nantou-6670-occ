/** IME composition is not a request to submit. Safari may end composition before keydown. */
export function createChatInputGuard(now = () => performance.now()) {
  let composing = false, endedAt = -Infinity;
  return {
    start() { composing = true; },
    end() { composing = false; endedAt = now(); },
    blocked(event = {}) { return composing || event.isComposing === true || event.keyCode === 229 || now() - endedAt < 80; },
    shouldSend(event) { return event.key === 'Enter' && !event.shiftKey && !event.repeat && !this.blocked(event); },
  };
}
