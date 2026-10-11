/** NoteBot's own public links, mirrored from notebot-web-v2's APP_CONFIG. Shared on request only. */
export const NOTEBOT_LINKS = [
  { id: "web", label: "NoteBot web", url: "https://butexnotebot.com", use: "Browse notes, labs, question banks and TexGPT in the browser." },
  { id: "app", label: "NoteBot app (Android)", url: "https://play.google.com/store/apps/details?id=com.hawkers.notebot", use: "The Android app on Google Play." },
  { id: "bot", label: "NoteBot Messenger bot", url: "https://www.messenger.com/t/103148557940299", use: "Ask NoteBot on Facebook Messenger." },
  { id: "submit", label: "Submit notes", url: "https://forms.gle/RjPXedjRDim4YE6P8", use: "Share your notes, lab reports or question papers with other students." },
  { id: "status", label: "Status page", url: "https://status.butexnotebot.com/", use: "Whether NoteBot's services are up right now." },
] as const;
