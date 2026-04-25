export interface ProcessedEventsStore {
  tryMarkProcessed(eventId: string): Promise<boolean>
}
