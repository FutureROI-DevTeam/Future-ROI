async page => {
  const assert=(condition,message)=>{if(!condition)throw Error(message)};
  const origin=new URL(page.url()).origin;
  const id=/\/goals\/([^/?]+)/.exec(page.url())[1];
  const base=origin+'/api/goals/'+id, goalUrl=origin+'/goals/'+id;
  const get=async suffix=>(await page.request.get(base+suffix)).json();
  const original=await get('?view=r11');
  assert(origin==='http://127.0.0.1:5319' && original.title==='英語の学習' && original.totalRequired===12000,'Dedicated synthetic fixture required');
  const logs=await get('/logs'), originalToday=await get('/today?view=r11');
  let writes=0;
  const onRequest=request=>{if(request.url()===base && request.method()==='PATCH')writes++};
  page.on('request',onRequest);
  const open=async amount=>{
    await page.goto(goalUrl+'/edit');
    const input=page.locator('#goal-initialProgress');await input.waitFor();
    assert(await input.isEnabled(),'recorded initial progress must be editable');
    assert(await page.locator('#goal-timezone').isDisabled(),'timezone stays locked');
    await input.fill(String(Math.floor(amount/60)));
    await page.locator('#goal-initialProgress-minutes').fill(String(amount%60));
    // Explicitly retain the fixture's original null answers; do not invent answers.
    for(const field of await page.locator('.r11-qp fieldset').all())await field.locator('input[value=""]').check();
    return input;
  };
  const confirm=async()=>{
    await page.getByRole('button',{name:'変更を保存',exact:true}).click();
    const dialog=page.getByRole('alertdialog');await dialog.waitFor();return dialog;
  };
  await page.setViewportSize({width:1440,height:1000});
  await open(600);
  let dialog=await confirm();
  assert(writes===0,'confirmation must not write');
  assert((await dialog.innerText()).includes('開始前の合計：'),'before/after shown');
  await page.screenshot({path:'.local/319/initial-confirm-desktop.png',fullPage:true});
  await dialog.getByRole('button',{name:'入力に戻る',exact:true}).click();
  assert(writes===0 && await page.locator('#goal-initialProgress').inputValue()==='10','cancel keeps input without saving');
  dialog=await confirm();
  await dialog.getByRole('button',{name:'訂正を含めて保存',exact:true}).click();
  await page.waitForURL(url=>url.pathname==='/goals');
  const changed=await get('?view=r11'), today=await get('/today?view=r11');
  assert(changed.initialProgress===600 && changed.progressDone===original.progressDone+600-original.initialProgress,'exact absolute correction');
  assert(changed.historyRevision===original.historyRevision,'baseline is not a daily edit');
  assert(JSON.stringify(await get('/logs'))===JSON.stringify(logs),'daily rows unchanged');
  assert(JSON.stringify(today.prediction.observations)===JSON.stringify(originalToday.prediction.observations),'observations unchanged');
  assert(JSON.stringify(today.prediction.posterior)===JSON.stringify(originalToday.prediction.posterior),'posterior unchanged');
  await page.goto(goalUrl);await page.getByRole('heading',{name:'これまでの積み上げ'}).waitFor();
  assert(await page.locator('.fr-save-feedback:not(.fr-sr-only)').count()===0,'correction never celebrates as today effort');
  await page.screenshot({path:'.local/319/initial-after-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await open(0);dialog=await confirm();
  await page.screenshot({path:'.local/319/initial-confirm-mobile.png',fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile overflow');
  await dialog.getByRole('button',{name:'訂正を含めて保存',exact:true}).click();await page.waitForURL(url=>url.pathname==='/goals');
  assert((await get('?view=r11')).initialProgress===0,'zero correction preserves records');
  // Another screen updates settings while this editor remains based on the old revision.
  await open(60);
  const current=await get('?view=r11');
  assert((await page.request.patch(base,{headers:{origin},data:{initialProgress:120,expectedGoalSettingsRevision:current.goalSettingsRevision}})).status()===200,'parallel correction');
  dialog=await confirm();await dialog.getByRole('button',{name:'訂正を含めて保存',exact:true}).click();
  await page.getByRole('button',{name:'最新の内容を読み込む',exact:true}).waitFor();
  assert(await page.locator('#goal-initialProgress').inputValue()==='1','409 retains draft');
  assert((await get('?view=r11')).initialProgress===120,'stale draft did not overwrite');
  await page.getByRole('button',{name:'最新の内容を読み込む',exact:true}).click();
  const refresh=page.getByText('最新の設定・回答を読み込みました',{exact:false});
  await refresh.waitFor();
  dialog=await confirm();
  await dialog.getByRole('button',{name:'入力に戻る',exact:true}).click();
  // Restore only this script's synthetic baseline, using the latest settings revision.
  const latest=await get('?view=r11');
  assert((await page.request.patch(base,{headers:{origin},data:{initialProgress:original.initialProgress,expectedGoalSettingsRevision:latest.goalSettingsRevision}})).status()===200,'restore synthetic baseline');
  page.off('request',onRequest);
  await page.goto(goalUrl);await page.getByRole('heading',{name:'これまでの積み上げ'}).waitFor();
  return {ok:true,writes,originalInitial:original.initialProgress,correctedInitial:600,zero:true,conflictRetainsDraft:true,logsUnchanged:JSON.stringify(await get('/logs'))===JSON.stringify(logs)};
}
