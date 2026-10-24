let timer = null;

self.onmessage = (e) => {
  if (e.data === "START") {
    if (timer) clearInterval(timer);

    // Only post TICK after 5 minutes have elapsed, NEVER immediately!
    timer = setInterval(
      () => {
        self.postMessage("TICK");
      },
      5 * 60 * 1000,
    ); // 5 minutes
  } else if (e.data === "STOP") {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }
};
