
const $=s=>document.querySelector(s);

let uid=localStorage.getItem("anon-chat-id");

if(!uid){
  uid=crypto.randomUUID();
  localStorage.setItem("anon-chat-id",uid);
}

let nickname=localStorage.getItem("anon-chat-name")||"";
$("#nickname").value=nickname;

let ws=null,dmTarget=null;
const renderedMessages=new Set();

async function api(path,opts={}){
  const r=await fetch(path,{
    ...opts,
    headers:{
      "X-Anonymous-ID":uid,
      ...(opts.headers||{})
    }
  });

  const d=await r.json().catch(()=>({}));

  if(!r.ok)throw Error(d.error||`HTTP ${r.status}`);

  return d;
}

function addMsg(m){
  if(m.id && renderedMessages.has(m.id))return;
  if(m.id)renderedMessages.add(m.id);

  const el=document.createElement("div");
  el.className="msg";

  const who=document.createElement("b");
  who.textContent=m.nickname||m.user;

  const body=document.createElement("div");
  body.textContent=m.body||"";

  const time=document.createElement("small");
  time.textContent=new Date(m.at||m.created_at).toLocaleString();

  el.append(who,body,time);

  // 给每条聊天消息添加举报按钮
  if(m.user && m.user!==uid){
    const rep=document.createElement("button");
    rep.type="button";
    rep.textContent="举报";
    rep.onclick=()=>report(m.user);
    el.append(rep);
  }

  $("#messages").append(el);
  $("#messages").scrollTop=$("#messages").scrollHeight;
}

async function refreshUsers(){
  try{
    const d=await api("/api/users");
    $("#users").replaceChildren();

    d.users.forEach(u=>{
      if(u.anon_id===uid)return;

      const row=document.createElement("div");
      row.className="user";

      const n=document.createElement("span");
      n.textContent=u.nickname;

      const dm=document.createElement("button");
      dm.textContent="私信";
      dm.onclick=()=>openDM(u.anon_id,u.nickname);

      const rep=document.createElement("button");
      rep.textContent="举报";
      rep.onclick=()=>report(u.anon_id);

      row.append(n,dm,rep);
      $("#users").append(row);
    });
  }catch{}
}

async function join(){
  nickname=$("#nickname").value.trim();

  if(nickname.length<2)
    return alert("昵称至少 2 个字符");

  localStorage.setItem("anon-chat-name",nickname);

  await api("/api/register",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({nickname})
  });

  const check=await api("/api/sanction-check");

  if(check.blocked){
    alert("当前账号受到封禁限制");
    return;
  }

  if(ws)ws.close();

  $("#messages").replaceChildren();
  renderedMessages.clear();

  const scheme=location.protocol==="https:"?"wss":"ws";

  ws=new WebSocket(
    `${scheme}://${location.host}/ws`
  );

  ws.onopen=()=>{
    $("#online").textContent="已连接";
    ws.send(JSON.stringify({type:"ping"}));
  };

  ws.onmessage=e=>{
    const m=JSON.parse(e.data);

    if(m.type==="history"){
      m.messages.forEach(addMsg);
    }else if(m.type==="chat"){
      addMsg(m);
    }else if(m.type==="presence"){
      $("#online").textContent=`当前在线连接：${m.count}`;
    }
  };

  ws.onclose=()=>{
    $("#online").textContent="已断开";
  };

  refreshUsers();
  loadNotices();
}

$("#join").onclick=()=>join().catch(e=>alert(e.message));

$("#send").onclick=async()=>{
  const body=$("#message").value.trim();

  if(!body||!ws||ws.readyState!==1)return;

  const s=await api("/api/sanction-check");

  if(s.blocked||s.muted)
    return alert("当前账号受到禁言或封禁限制");

  ws.send(JSON.stringify({
    type:"chat",
    nickname,
    body
  }));

  $("#message").value="";
};

$("#image").onchange=async e=>{
  const f=e.target.files[0];

  if(!f)return;

  if(f.size>5*1024*1024)
    return alert("图片不能超过 5 MB");

  try{
    const d=await api("/api/image",{
      method:"POST",
      headers:{"content-type":f.type},
      body:f
    });

    const body=`[图片] ${d.url}`;

    ws.send(JSON.stringify({
      type:"chat",
      nickname,
      body
    }));
  }catch(err){
    alert(err.message);
  }

  e.target.value="";
};

// 举报用户
async function report(target){
  const reason=prompt("请填写举报理由");

  if(!reason)return;

  try{
    await api("/api/report",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({
        targetUserId:target,
        targetType:"user",
        reason
      })
    });

    alert("举报已提交");
  }catch(e){
    alert(e.message);
  }
}

async function openDM(target,name){
  dmTarget=target;

  $("#dmBox").classList.remove("hidden");
  $("#dmTitle").textContent=`与 ${name} 私信`;

  await loadDM();
}

async function loadDM(){
  const d=await api(
    `/api/dm?with=${encodeURIComponent(dmTarget)}`
  );

  $("#dmMessages").replaceChildren();

  d.messages.forEach(m=>{
    const p=document.createElement("p");

    p.textContent=
      `${m.sender_id===uid?"我":"对方"}：${m.body}`;

    $("#dmMessages").append(p);
  });
}

$("#dmSend").onclick=async()=>{
  if(!dmTarget)return;

  try{
    await api("/api/dm",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({
        to:dmTarget,
        body:$("#dmText").value
      })
    });

    $("#dmText").value="";
    await loadDM();
  }catch(e){
    alert(e.message);
  }
};

async function loadNotices(){
  try{
    const d=await api("/api/notices");

    const unread=d.notices.filter(n=>!n.read_at);

    $("#unread").textContent=
      unread.length?`(${unread.length})`:"";

    $("#noticeBox").replaceChildren();

    unread.forEach(n=>{
      const p=document.createElement("p");

      p.textContent=
        `${n.title}：${n.result}。${n.note||""}`;

      $("#noticeBox").append(p);
    });
  }catch{}
}

$("#notices").onclick=()=>{
  $("#noticeBox").classList.toggle("hidden");
  loadNotices();
};

setInterval(()=>{
  if(uid)refreshUsers();
},15000);
