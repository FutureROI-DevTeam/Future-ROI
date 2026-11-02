async page => {
 const assert=(condition,message)=>{if(!condition)throw Error(message)};
 const origin=new URL(page.url()).origin,id=/\/goals\/([^/?]+)/.exec(page.url())[1],base=origin+'/api/goals/'+id;
 const get=async suffix=>(await page.request.get(base+suffix)).json();
 const original=await get('?view=r11'),logs=await get('/logs');
 assert(origin==='http://127.0.0.1:5319' && original.title==='英語の学習','Dedicated fixture required');
 await page.goto(origin+'/goals/'+id+'/edit');await page.locator('#goal-initialProgress').fill('7');
 await page.locator('#goal-initialProgress-minutes').fill('0');
 for(const field of await page.locator('.r11-qp fieldset').all())await field.locator('input[value=""]').check();
 let attempts=0;
 await page.route(base,async route=>{
  if(route.request().method()!=='PATCH')return route.continue();
  attempts++;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'UNAVAILABLE',message:'Synthetic local update failure'}})});
 });
 await page.locator('form button[type=submit]').click();
 let dialog=page.getByRole('alertdialog');await dialog.waitFor();
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow at '+width);
  if(width===390 || width===1440)await dialog.screenshot({path:'.local/319/initial-dialog-'+width+'.png'});
 }
 await dialog.getByRole('button',{name:'訂正を含めて保存',exact:true}).click();
 await page.getByText('保存できたか確認できていません。入力内容は残っています。',{exact:false}).waitFor();
 assert(attempts===1 && await page.locator('#goal-initialProgress').inputValue()==='7','failure retains initial draft');
 await page.evaluate(()=>{window.dispatchEvent(new Event('offline'));window.dispatchEvent(new Event('online'))});
 await page.locator('#goal-initialProgress').waitFor();
 assert(await page.locator('#goal-initialProgress').inputValue()==='7' && attempts===1,'healthy owner confirmation retains draft without resend');
 assert((await get('?view=r11')).initialProgress===original.initialProgress,'503 did not change DB');
 await page.unroute(base);
 await page.locator('form button[type=submit]').click();dialog=page.getByRole('alertdialog');await dialog.waitFor();
 await dialog.getByRole('button',{name:'訂正を含めて保存',exact:true}).click();await page.waitForURL(url=>url.pathname==='/goals');
 const saved=await get('?view=r11');assert(saved.initialProgress===420,'explicit retry replaces absolute baseline');
 assert(JSON.stringify(await get('/logs'))===JSON.stringify(logs),'retry keeps daily records');
 await page.request.patch(base,{headers:{origin},data:{initialProgress:original.initialProgress,expectedGoalSettingsRevision:saved.goalSettingsRevision}});
 await page.goto(origin+'/goals/'+id);
 return {ok:true,updateFailureRetainsDraft:true,sameOwnerConfirmationRetainsDraft:true,explicitRetry:true,widths:[320,390,768,1440]};
}
