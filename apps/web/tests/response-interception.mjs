// Handlers must await all their CDP commands (the browser session bounds each send).
export async function withResponseInterception(cdp, { patterns, onPaused, onError = () => {} }, run) {
  const pending = new Set(), errors = [];
  const intercept = event => {
    const task = Promise.resolve().then(async () => {
      const message = JSON.parse(String(event.data));
      if (message.method === 'Fetch.requestPaused') await onPaused(message.params);
    }).catch(error => {
      errors.push(error);
      try { onError(error); }
      catch (observerError) { errors.push(observerError); }
    });
    pending.add(task);
    void task.then(() => pending.delete(task), () => pending.delete(task));
  };
  cdp.socket.addEventListener('message', intercept);
  let result;
  try {
    await cdp.send('Fetch.enable', { patterns });
    result = await run();
  } catch (error) { errors.push(error); }
  finally {
    // Freeze the handler set first. Disabling while a handler can still send
    // continue/fail races with Chrome releasing its paused requests (#343).
    cdp.socket.removeEventListener('message', intercept);
    await Promise.allSettled(pending);
    try { await cdp.send('Fetch.disable'); }
    catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, 'Controlled response interception failed');
  return result;
}
