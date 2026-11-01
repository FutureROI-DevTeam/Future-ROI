async page => {
  const assert=(condition,message)=>{if(!condition)throw Error(message)};
  const origin=new URL(page.url()).origin;
  assert(origin==='http://127.0.0.1:5319','Dedicated local stack required');
  const id=/\/goals\/([^/?]+)/.exec(page.url())[1];
  await page.unrouteAll({behavior:'wait'});
  const match=url=>url.pathname==='/api/goals/'+id && url.searchParams.get('view')==='r11';
  let reads=0;
  await page.route(match,async route=>{
    const response=await route.fetch();const body=await response.json();
    assert(typeof body.historyFingerprint==='string','real API returns Goal history fingerprint');
    body.historyFingerprint='[]';reads++;
    await route.fulfill({response,json:body});
  });
  await page.goto(origin+'/goals/'+id+'/history');
  await page.getByRole('button',{name:'再読み込み',exact:true}).waitFor();
  assert(await page.locator('.fr-history__cal').count()===0,'mismatched initial history must not be presented as facts');
  assert(reads>=4 && reads<=5,'bounded initial reads (Strict Mode may cancel one mount request) plus three resyncs: '+reads);
  await page.unroute(match);
  await page.getByRole('button',{name:'再読み込み',exact:true}).click();
  await page.locator('.fr-history__cal').waitFor();
  await page.getByRole('button',{name:'この日の記録を編集',exact:true}).waitFor();
  await page.route('**/api/goals/*/today?view=r11',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'PREDICTION_FAILED',message:'synthetic prediction failure'}})}));
  await page.reload();
  await page.locator('.fr-history__cal').waitFor();
  assert(await page.getByRole('button',{name:'この日の記録を編集',exact:true}).isEnabled(),'history remains editable independently of forecasting');
  await page.unroute('**/api/goals/*/today?view=r11');
  await page.goto(origin+'/goals/'+id);
  await page.getByRole('heading',{name:'これまでの積み上げ'}).waitFor();
  return {boundedReads:reads,mismatchRejected:true,manualRecovery:true,forecastIndependent:true};
}
