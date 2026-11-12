"use strict";
const $=id=>document.getElementById(id);
let currentUrl=null;
async function readTab(){
  currentUrl=null;
  try {
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    const raw=tab?.url;
    if(!raw) throw new Error("無法讀取目前分頁網址；請先在物件頁點擊擴充功能圖示。");
    const u=new URL(raw);
    if(!["https:","http:"].includes(u.protocol)) throw new Error("此頁面不是可查詢的網站網址。");
    currentUrl=u.href;
    $("current").textContent=currentUrl;
    $("status").textContent="網址已讀取，等待開始。";
  }catch(e){$("current").textContent=e.message;$("status").textContent="尚未取得可查詢網址。";}
}
$("refresh").addEventListener("click",readTab);
$("scan").addEventListener("click",()=>{
  if(!currentUrl){$("status").textContent="請先讀取有效的房源網址。";return;}
  $("status").textContent="已接受網址；尚未接通伺服器解析及合法候選資料來源。";
  $("first").textContent="尚無可核實候選";
  $("others").textContent="尚無候選";
  $("score").textContent="無法計算";
  $("evidence").textContent="資料來源：未介接；地號與建號：未知。";
});
readTab();
