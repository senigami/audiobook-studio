# Implementation Blueprint: Frontend Communication & State (Studio 2.0)

## 1. Objective
Design a multi-layered communication system that provides instant UI feedback for background processes while maintaining a robust, single source of truth for page-load data.

## 2. Recommendation: Zustand
**Zustand** is recommended as the primary state management library for Studio 2.0 because:
- **Lightweight**: Minimal boilerplate compared to Redux.
- **Reactive**: Easy to subscribe to specific "slices" of state.
- **Decoupled**: Stores can exist outside of the React component tree, making it easy to sync with WebSocket events.

## 3. Communication Layers

### Layer 1: The Reactive Store (Instant Feedback)
Designed for high-frequency updates that don't necessarily need to be persisted to a database immediately, or are broadcasts of transient state changes.
- **Technology**: Zustand + WebSockets.
- **Use Cases**: Real-time progress bars, active job status, "Preparing" vs "Running" state, and instant notifications.
- **Implementation**: A `useJobStore` that listens to the `job_updated` and `segment_progress` WS events and updates its internal state slices without forcing a full page re-render.
- **State Boundary**: This layer should own transient overlays and UI session state only, not canonical project/chapter data.

### Layer 2: The Data Layer (Context Resolution)
Designed for "Hard Truth" data required for page initialization and resolving context on a hard browser reload.
- **Technology**: API (REST) + React Cache/SWR.
- **Use Cases**: Loading the list of Projects, fetching Chapter text for the editor, resolving speaker profile details on initial load.
- **Implementation**: On page reload or navigation, components fetch their primary data from the API. The `useJobStore` (Layer 1) then "connects" to these items to overlay real-time progress. This ensures the app is never out of sync after an interruption.
- **Merge Rule**: The data layer hydrates entities first, then the live store overlays non-destructive status fields like progress, queue state, and optimistic local-draft markers.

## 4. WebSocket Bridge (Store Integration)

```typescript
// Example Zustand Store Interface
interface JobStore {
  activeJobs: Record<string, JobState>;
  updateJob: (jid: string, updates: Partial<JobState>) => void;
}

// Global WebSocket Listener (outside component tree)
socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'job_updated') {
    useJobStore.getState().updateJob(data.job_id, data.updates);
  }
};
```

## 5. Non-Breaking Component Design
Modules (Chapter Editor, Library, Voices) communicate via the shared stores.
- **Subscription Pattern**: A `StatusOrb` component subscribes ONLY to the status of its specific ID. This prevents the entire UI from re-rendering when one segment's progress moves by 1%.
- **Event Bus**: For non-state notifications (e.g., "Export Complete - Download Now"), a simple event bus or the Zustand store can be used to trigger transient UI elements like Toast notifications.

## 5.1 Potential Problems And Better Implementations

- **Problem: The store can become a second database**
  Better implementation: Keep canonical entities in API-backed hooks and use Zustand for overlays, selections, filters, and transient progress only.
- **Problem: WebSocket reconnect can miss updates**
  Better implementation: On reconnect, run a targeted REST rehydration for the visible project/chapter plus active jobs.
- **Problem: Autosave and live updates can overwrite each other**
  Better implementation: Track local draft revision separately and only merge server data that does not clobber active unsaved edits.

## 6. Planned Benefits
- **Zero-Jump UI**: Page reloads fetch the "static" state from the DB, and the Store immediately picks up the latest "live" progress from the next heartbeat.
- **Performance**: High-frequency progress updates are handled in a optimized, non-rendering store, keeping the UI responsive.
- **Simplicity**: Developers don't need to pass "progress" props down through 10 layers of components.
