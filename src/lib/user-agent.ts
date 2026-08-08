// The signature every outbound request from Korido carries.
//
// Spec §4 requires scraped price collection to use an identifiable UA. That is
// only meaningful if the contact address is a mailbox someone can actually
// reach — a provider who wants us to stop must be able to say so. Keep this
// pointing at a live inbox; if the address changes, change it here and nowhere
// else, and make sure the old one still forwards for a while.
export const KORIDO_UA =
  "KoridoBot/1.0 (+https://korido.app; rate comparison; contact: hello@korido.app)";
