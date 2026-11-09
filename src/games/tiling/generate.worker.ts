// Generates a day's puzzle off the main thread: the search takes up to half a
// second, which would otherwise freeze the page on first load.
import { rngFor } from "../../lib/daily";
import { generate } from "./logic";

self.addEventListener("message", (event: MessageEvent<number>) => {
  // worker postMessage takes no targetOrigin (that's window.postMessage)
  // oxlint-disable-next-line unicorn/require-post-message-target-origin
  self.postMessage(generate(rngFor("tiling", event.data)));
});
