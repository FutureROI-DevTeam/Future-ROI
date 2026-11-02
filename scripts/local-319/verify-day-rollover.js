async page => {
  const assert=(condition,message)=>{if(!condition)throw Error(message)};
  const origin=new URL(page.url()).origin;
  assert(origin==='http://127.0.0.1:5319','Use only the dedicated local stack');
  const id=/\/goals\/([^/?]+)/.exec(page.url())[1];
  await page.unrouteAll({behavior:'wait'});
  const base=origin+'/api/goals/'+id;
  const before=await (await page.request.get(base+'?view=r11')).json();
  await page.goto(origin+'/goals/'+id+'/history');
  await page.getByRole('button',{name:'この日の記録を編集',exact:true}).click();
  const heading=await page.getByRole('heading',{name:/の記録を編集/}).innerText();
  await page.getByRole('textbox',{name:/実施量/}).fill('77');
  const match=url=>url.pathname==='/api/goals/'+id && url.searchParams.get('view')==='r11';
  const tomorrow=new Date(before.today+'T00:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
  const nextDate=tomorrow.toISOString().slice(0,10);
  await page.route(match,async route=>{
    try {
      const response=await route.fetch();const body=await response.json();
      await route.fulfill({response,json:{...body,today:nextDate,todayStatus:'UNRECORDED'}});
    } catch(error) {
      if(route.request().failure()?.errorText?.includes('ERR_ABORTED')) return;
      throw error;
    }
  });
  const response=page.waitForResponse(response=>response.url()===base+'?view=r11');
  await page.evaluate(()=>window.dispatchEvent(new Event('offline')));
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  assert((await (await response).json()).today===nextDate,'new-day response fixture reached page');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert(await page.getByRole('heading',{name:/の記録を編集/}).innerText()===heading,'editor keeps original day after rollover response');
  assert(await page.getByRole('textbox',{name:/実施量/}).inputValue()==='77','rollover keeps unsaved draft');
  await page.unroute(match);
  await page.getByRole('button',{name:'変更をやめる',exact:true}).click();
  const after=await (await page.request.get(base+'?view=r11')).json();
  assert(after.progressDone===before.progressDone,'rollover/cancel never auto-saves');
  await page.goto(origin+'/goals/'+id);
  await page.getByRole('heading',{name:'これまでの積み上げ'}).waitFor();
  return {pinnedDay:heading,draftRetained:true,writes:0};
}
