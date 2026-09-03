export function createPaneId(): string {
    return `pane-${crypto.randomUUID()}`;
}
