interface Env {
  CHAT_DB: D1Database;
  CHAT_IMAGES: R2Bucket;
  CHAT_ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
  MAX_IMAGE_BYTES: string;
  MESSAGE_LIMIT: string;
  ADMIN_PASSWORD: string;
  ADMIN_SESSION_SECRET: string;
  IP_HASH_SALT: string;
}

type J = Record<string, unknown>;

const json = (data: unknown, status=200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });

const now = () => Date.now();
const id = () => crypto.randomUUID();

const text = (v: unknown, max=500) =>
  typeof v === "string" ? v.trim().slice(0,max) : "";

async function sha(value:string) {
  const b = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return [...new Uint8Array(b)]
    .map(x=>x.toString(16).padStart(2,"0"))
    .join("");
}

function anon(req:Request) {
  return text(req.headers.get("x-anonymous-id"),80);
}

function ipHash(req:Request) {
  return req.headers.get("cf-connecting-ip") || "unknown";
}

async function getIpHash(req:Request, env:Env) {
  const ip=ipHash(req);
  return sha(`${env.IP_HASH_SALT}:${ip}`);
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function signAdminSession(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );

  return base64url(new Uint8Array(signature));
}

async function isAdmin(req: Request, env: Env): Promise<boolean> {
  try {
    if (!env.ADMIN_SESSION_SECRET) return false;

    const cookie = req.headers.get("Cookie") || "";
    const match = cookie.match(/(?:^|;\s*)admin_session=([^;]+)/);

    if (!match) return false;

    const parts = match[1].split(".");
    if (parts.length !== 2) return false;

    const [payload, signature] = parts;

    const expected = await signAdminSession(
      payload,
      env.ADMIN_SESSION_SECRET
    );

    if (signature !== expected) return false;

    let encoded = payload
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    encoded += "=".repeat((4 - encoded.length % 4) % 4);

    const decoded = atob(encoded);
    const session = JSON.parse(decoded);

    return Number.isFinite(session.exp) && session.exp > now();
  } catch {
    return false;
  }
}

async function audit(
  env:Env,
  req:Request,
  action:string,
  target?:string
) {
  await env.CHAT_DB.prepare(
    "INSERT INTO admin_audit_logs(id,admin_email,action,target_id,created_at) VALUES(?,?,?,?,?)"
  )
    .bind(id(), "local-admin", action, target||null, now())
    .run();
}

async function event(
  env:Env,
  req:Request,
  type:string,
  severity:string,
  details:string,
  user=anon(req)
) {
  await env.CHAT_DB.prepare(
    "INSERT INTO security_events(id,event_type,severity,anon_id,ip_hash,details,created_at) VALUES(?,?,?,?,?,?,?)"
  )
    .bind(
      id(),
      type,
      severity,
      user||null,
      await getIpHash(req,env),
      details.slice(0,300),
      now()
    )
    .run();
}

async function sanctions(
  env:Env,
  user:string,
  ipHashValue:string
) {
  const t=now();

  return env.CHAT_DB.prepare(`
    SELECT type,ends_at,reason FROM sanctions
    WHERE active=1 AND starts_at<=?
    AND (ends_at IS NULL OR ends_at>?)
    AND (user_id=? OR (ip_hash IS NOT NULL AND ip_hash=?))
  `)
    .bind(t,t,user,ipHashValue)
    .all<{type:string;ends_at:number|null;reason:string}>();
}

async function recordVisit(
  env:Env,
  req:Request,
  status:number
) {
  await env.CHAT_DB.prepare(
    "INSERT INTO visitor_logs(id,ip_hash,anon_id,path,method,status,created_at) VALUES(?,?,?,?,?,?,?)"
  )
    .bind(
      id(),
      await getIpHash(req,env),
      anon(req)||null,
      new URL(req.url).pathname.slice(0,160),
      req.method,
      status,
      now()
    )
    .run();

  await env.CHAT_DB.prepare(
    "DELETE FROM visitor_logs WHERE created_at < ?"
  )
    .bind(now()-7*86400000)
    .run();
}

async function handleApi(
  req:Request,
  env:Env
):Promise<Response> {
  const url=new URL(req.url);
  const path=url.pathname;
  const user=anon(req);
  const iph=await getIpHash(req,env);

  // 管理员登录
  if (path === "/api/admin/login" && req.method === "POST") {
    const origin = req.headers.get("Origin");

    if (origin !== url.origin) {
      return json({ error: "请求来源无效" }, 403);
    }

    let body: J;

    try {
      body = await req.json() as J;
    } catch {
      return json({ error: "请求数据无效" }, 400);
    }

    const password = typeof body.password === "string"
      ? body.password
      : "";

    if (
      !env.ADMIN_PASSWORD ||
      !env.ADMIN_SESSION_SECRET ||
      password.length > 200 ||
      password !== env.ADMIN_PASSWORD
    ) {
      return json({ error: "管理员密码错误" }, 401);
    }

    const payload = base64url(
      new TextEncoder().encode(
        JSON.stringify({
          exp: now() + 8 * 60 * 60 * 1000
        })
      )
    );

    const signature = await signAdminSession(
      payload,
      env.ADMIN_SESSION_SECRET
    );

    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "set-cookie":
          `admin_session=${payload}.${signature}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`
      }
    });
  }

  // 管理员退出
  if (path === "/api/admin/logout" && req.method === "POST") {
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "set-cookie":
          "admin_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
      }
    });
  }

  // 检查管理员登录状态
  if (path === "/api/admin/me" && req.method === "GET") {
    return json({
      authenticated: await isAdmin(req, env)
    });
  }

  if (
    path.startsWith("/api/") &&
    !user &&
    !path.startsWith("/api/admin/")
  ) {
    return json({error:"Missing X-Anonymous-ID"},400);
  }

  // 用户注册
  if(path==="/api/register" && req.method==="POST") {
    const body=await req.json() as J;
    const nickname=text(body.nickname,24);

    if (!/^[\p{L}\p{N}_ -]{2,24}$/u.test(nickname)) {
      return json({
        error:"昵称需为 2–24 个字母、数字或常用字符"
      },400);
    }

    await env.CHAT_DB.prepare(`
      INSERT INTO users(anon_id,nickname,created_at,last_seen)
      VALUES(?,?,?,?)
      ON CONFLICT(anon_id)
      DO UPDATE SET nickname=excluded.nickname,last_seen=excluded.last_seen
    `)
      .bind(user,nickname,now(),now())
      .run();

    return json({ok:true,nickname});
  }

  // 处罚状态检查
  if(path==="/api/sanction-check") {
    const rows=await sanctions(env,user,iph);

    return json({
      blocked:rows.results.some(
        x=>x.type==="ban"||x.type==="ip_ban"
      ),
      muted:rows.results.some(x=>x.type==="mute"),
      sanctions:rows.results.map(x=>({
        type:x.type,
        endsAt:x.ends_at,
        reason:x.reason
      }))
    });
  }

  // 发送私信
  if(path==="/api/dm" && req.method==="POST") {
    const b=await req.json() as J;
    const to=text(b.to,80);
    const body=text(b.body,2000);

    if (!to||!body) {
      return json({error:"收件人和消息不能为空"},400);
    }

    const s=await sanctions(env,user,iph);

    if(s.results.length) {
      return json({error:"当前账号受到限制"},403);
    }

    const target=await env.CHAT_DB.prepare(
      "SELECT anon_id FROM users WHERE anon_id=?"
    ).bind(to).first();

    if(!target) {
      return json({error:"用户不存在"},404);
    }

    const mid=id();

    await env.CHAT_DB.prepare(
      "INSERT INTO private_messages(id,sender_id,recipient_id,body,created_at) VALUES(?,?,?,?,?)"
    )
      .bind(mid,user,to,body,now())
      .run();

    return json({ok:true,id:mid});
  }

  // 获取私信
  if(path==="/api/dm" && req.method==="GET") {
    const other=text(url.searchParams.get("with"),80);

    const rows=await env.CHAT_DB.prepare(`
      SELECT id,sender_id,recipient_id,body,created_at
      FROM private_messages
      WHERE (sender_id=? AND recipient_id=?)
      OR (sender_id=? AND recipient_id=?)
      ORDER BY created_at DESC LIMIT 100
    `)
      .bind(user,other,other,user)
      .all();

    return json({
      messages:rows.results.reverse()
    });
  }

  // 在线用户
  if(path==="/api/users" && req.method==="GET") {
    const rows=await env.CHAT_DB.prepare(
      "SELECT anon_id,nickname,last_seen FROM users WHERE last_seen>? ORDER BY nickname LIMIT 100"
    )
      .bind(now()-90000)
      .all();

    return json({users:rows.results});
  }

  // 提交举报
  if(path==="/api/report" && req.method==="POST") {
    const b=await req.json() as J;
    const target=text(b.targetUserId,80);
    const reason=text(b.reason,500);

    if(!target||!reason) {
      return json({error:"请填写举报对象和理由"},400);
    }

    const rid=id();

    await env.CHAT_DB.prepare(`
      INSERT INTO reports(
        id,reporter_id,target_user_id,target_type,target_id,reason,created_at
      )
      VALUES(?,?,?,?,?,?,?)
    `)
      .bind(
        rid,
        user,
        target,
        text(b.targetType,20)||"user",
        text(b.targetId,80)||null,
        reason,
        now()
      )
      .run();

    await event(
      env,
      req,
      "report_submitted",
      "info",
      "A report was submitted."
    );

    return json({ok:true,id:rid});
  }

  // 获取通知
  if(path==="/api/notices" && req.method==="GET") {
    const rows=await env.CHAT_DB.prepare(`
      SELECT id,report_id,title,result,note,created_at,read_at
      FROM notices
      WHERE user_id=?
      ORDER BY created_at DESC LIMIT 50
    `)
      .bind(user)
      .all();

    return json({notices:rows.results});
  }

  // 标记通知已读
  if(path==="/api/notices/read" && req.method==="POST") {
    const b=await req.json() as J;

    await env.CHAT_DB.prepare(
      "UPDATE notices SET read_at=? WHERE id=? AND user_id=?"
    )
      .bind(now(),text(b.id,80),user)
      .run();

    return json({ok:true});
  }

  // 管理员 API 统一验证
  if(path.startsWith("/api/admin/")) {
    if(!await isAdmin(req,env)) {
      await event(
        env,
        req,
        "admin_denied",
        "medium",
        "Admin access denied"
      );

      return json({error:"Access denied"},403);
    }

    // 举报列表
    if(path==="/api/admin/reports" && req.method==="GET") {
      const rows=await env.CHAT_DB.prepare(`
        SELECT
          id,
          reporter_id,
          target_user_id,
          target_type,
          target_id,
          reason,
          status,
          public_result,
          created_at
        FROM reports
        ORDER BY created_at DESC
        LIMIT 200
      `).all();

      return json({reports:rows.results});
    }

    // 访问记录
    if(path==="/api/admin/visitors") {
      const rows=await env.CHAT_DB.prepare(`
        SELECT
          id,
          substr(ip_hash,1,16) AS ip_fingerprint,
          anon_id,
          path,
          method,
          status,
          created_at
        FROM visitor_logs
        ORDER BY created_at DESC
        LIMIT 200
      `).all();

      return json({visitors:rows.results});
    }

    // 安全事件
    if(path==="/api/admin/security") {
      const rows=await env.CHAT_DB.prepare(
        "SELECT * FROM security_events ORDER BY created_at DESC LIMIT 200"
      ).all();

      return json({events:rows.results});
    }

    // 处罚记录
    if(path==="/api/admin/sanctions") {
      const rows=await env.CHAT_DB.prepare(`
        SELECT
          id,user_id,type,reason,starts_at,ends_at,
          active,report_id
        FROM sanctions
        ORDER BY starts_at DESC
        LIMIT 200
      `).all();

      return json({sanctions:rows.results});
    }

    // 处理举报
    if(path==="/api/admin/report/resolve" && req.method==="POST") {
      const b=await req.json() as J;

      const rid=text(b.reportId,80);
      const action=text(b.action,20);
      const targetNote=text(b.targetNote,1000);
      const reporterNote=text(b.reporterNote,1000);
      const publicResult=text(b.publicResult,500);
      const reason=text(b.reason,500)||"违反聊天室规则";

      const report=await env.CHAT_DB.prepare(
        "SELECT * FROM reports WHERE id=?"
      )
        .bind(rid)
        .first<any>();

      if(!report) {
        return json({error:"举报不存在"},404);
      }

      const allowed=["none","warning","mute","ban","ip_ban"];

      if(!allowed.includes(action)) {
        return json({error:"处罚类型无效"},400);
      }

      let ends:number|null=null;
      const duration=Number(b.durationMs||0);

      if(duration>0) {
        ends=now()+Math.min(duration,30*86400000);
      }

      if(["mute","ban","ip_ban"].includes(action)) {
        const sid=id();

        const targetIp=action==="ip_ban"
          ? await env.CHAT_DB.prepare(
              "SELECT ip_hash FROM visitor_logs WHERE anon_id=? ORDER BY created_at DESC LIMIT 1"
            )
              .bind(report.target_user_id)
              .first<any>()
          : null;

        await env.CHAT_DB.prepare(`
          INSERT INTO sanctions(
            id,user_id,ip_hash,type,reason,starts_at,
            ends_at,report_id,created_by
          )
          VALUES(?,?,?,?,?,?,?,?,?)
        `)
          .bind(
            sid,
            action==="ip_ban"?null:report.target_user_id,
            targetIp?.ip_hash||null,
            action,
            reason,
            now(),
            ends,
            rid,
            "local-admin"
          )
          .run();
      }

      await env.CHAT_DB.prepare(`
        UPDATE reports
        SET status='resolved',
          public_result=?,
          reporter_note=?,
          target_note=?,
          internal_note=?,
          handled_at=?
        WHERE id=?
      `)
        .bind(
          publicResult,
          reporterNote,
          targetNote,
          text(b.internalNote,1500),
          now(),
          rid
        )
        .run();

      const result=
        `${action}${ends?`，到期时间 ${new Date(ends).toISOString()}`:""}`;

      await env.CHAT_DB.prepare(`
        INSERT INTO notices(
          id,user_id,report_id,title,result,note,created_at
        )
        VALUES(?,?,?,?,?,?,?)
      `)
        .bind(
          id(),
          report.reporter_id,
          rid,
          "举报处理结果",
          result,
          reporterNote||publicResult,
          now()
        )
        .run();

      await env.CHAT_DB.prepare(`
        INSERT INTO notices(
          id,user_id,report_id,title,result,note,created_at
        )
        VALUES(?,?,?,?,?,?,?)
      `)
        .bind(
          id(),
          report.target_user_id,
          rid,
          "处罚处理结果",
          result,
          targetNote||publicResult,
          now()
        )
        .run();

      await audit(env,req,"resolve_report",rid);

      return json({ok:true});
    }

    // 撤销处罚
    if(path==="/api/admin/sanction/revoke" && req.method==="POST") {
      const b=await req.json() as J;
      const sid=text(b.id,80);

      await env.CHAT_DB.prepare(
        "UPDATE sanctions SET active=0 WHERE id=?"
      )
        .bind(sid)
        .run();

      await audit(env,req,"revoke_sanction",sid);

      return json({ok:true});
    }

    // 手动封禁用户
    if(path==="/api/admin/user/ban" && req.method==="POST") {
      const b=await req.json() as J;
      const target=text(b.userId,80);
      const reason=text(b.reason,500);

      if(!target||!reason) {
        return json({error:"需要用户 ID 和原因"},400);
      }

      await env.CHAT_DB.prepare(`
        INSERT INTO sanctions(
          id,user_id,type,reason,starts_at,ends_at,created_by
        )
        VALUES(?,?,?,?,?,?,?)
      `)
        .bind(
          id(),
          target,
          "ban",
          reason,
          now(),
          b.permanent?null:now()+86400000,
          "local-admin"
        )
        .run();

      await audit(env,req,"ban_user",target);

      return json({ok:true});
    }

    // IP 指纹封禁
    if(path==="/api/admin/ip/ban" && req.method==="POST") {
      const b=await req.json() as J;
      const fingerprint=text(b.fingerprint,64);
      const reason=text(b.reason,500);

      if(!/^[a-f0-9]{64}$/.test(fingerprint)||!reason) {
        return json({
          error:"需要有效的 IP 指纹和原因"
        },400);
      }

      await env.CHAT_DB.prepare(`
        INSERT INTO sanctions(
          id,ip_hash,type,reason,starts_at,ends_at,created_by
        )
        VALUES(?,?,?,?,?,?,?)
      `)
        .bind(
          id(),
          fingerprint,
          "ip_ban",
          reason,
          now(),
          now()+86400000,
          "local-admin"
        )
        .run();

      await audit(
        env,
        req,
        "ip_ban_fingerprint",
        fingerprint.slice(0,16)
      );

      return json({ok:true});
    }
  }

  return json({error:"Not found"},404);
}

export class ChatRoom {
  state: DurableObjectState;
  env: Env;
  sockets: Set<WebSocket>;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.sockets = new Set();
  }

  async fetch(req: Request) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      if (req.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected websocket", { status: 426 });
      }

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      server.accept();
      this.sockets.add(server);

      const user = url.searchParams.get("u") || "";

      server.serializeAttachment({
        user,
        last: now()
      });

      server.addEventListener("message", async ev => {
        try {
          const msg = JSON.parse(String(ev.data));

          if (msg.type === "ping") {
            server.send(JSON.stringify({
              type: "pong",
              at: now()
            }));
            return;
          }

          if (msg.type !== "chat" || typeof msg.body !== "string") {
            return;
          }

          const body = text(
            msg.body,
            Number(this.env.MESSAGE_LIMIT || 500)
          );

          if (!body) return;

          const record = {
            type: "chat",
            id: id(),
            user,
            nickname: text(msg.nickname, 24),
            body,
            at: now()
          };

          await this.state.storage.put(
            `msg:${record.id}`,
            record
          );

          const keys = await this.state.storage.list({
            prefix: "msg:"
          });

          if (keys.size > 300) {
            const oldest = [...keys.keys()]
              .sort()
              .slice(0, keys.size - 300);

            for (const k of oldest) {
              await this.state.storage.delete(k);
            }
          }

          for (const ws of this.sockets) {
            try {
              ws.send(JSON.stringify(record));
            } catch {}
          }
        } catch {}
      });

      server.addEventListener("close", () => {
        this.sockets.delete(server);
        this.broadcastPresence();
      });

      server.addEventListener("error", () => {
        this.sockets.delete(server);
        this.broadcastPresence();
      });

      const history = await this.state.storage.list({
        prefix: "msg:"
      });

      server.send(JSON.stringify({
        type: "history",
        messages: [...history.values()].sort(
          (a: any, b: any) => a.at - b.at
        )
      }));

      await this.broadcastPresence();

      return new Response(null, {
        status: 101,
        webSocket: client
      });
    }

    return json({
      online: this.sockets.size
    });
  }

  async broadcastPresence() {
    const count = this.sockets.size;

    for (const ws of this.sockets) {
      try {
        ws.send(JSON.stringify({
          type: "presence",
          count
        }));
      } catch {}
    }
  }
}

export default {
  async fetch(
    req:Request,
    env:Env,
    ctx:ExecutionContext
  ):Promise<Response> {
    const url=new URL(req.url);
    let response:Response;

    if(url.pathname==="/ws") {
      const stub=env.CHAT_ROOM.get(
        env.CHAT_ROOM.idFromName("main")
      );

      // 修改：优先读取请求头，否则从 WebSocket URL 查询参数读取用户 ID
      const u=anon(req)||text(url.searchParams.get("u"),80);

      response=await stub.fetch(
        new Request(
          `https://room/ws?u=${encodeURIComponent(u)}`,
          req
        )
      );

    } else if(
      url.pathname.startsWith("/api/")||
      url.pathname.startsWith("/image/")
    ) {
      response=await handleApi(req,env);

    } else if(
      url.pathname==="/admin"||
      url.pathname==="/admin/"
    ) {
      response=await env.ASSETS.fetch(
        new Request(
          new URL("/admin.html",req.url),
          req
        )
      );

    } else {
      response=await env.ASSETS.fetch(req);
    }

    const headers=new Headers(response.headers);

    if(url.pathname==="/ws") return response;

    headers.set("x-content-type-options","nosniff");
    headers.set("referrer-policy","no-referrer");

    headers.set(
      "permissions-policy",
      "camera=(), microphone=(), geolocation=()"
    );

    headers.set(
      "content-security-policy",
      "default-src 'self'; img-src 'self' blob: data:; connect-src 'self' wss: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    );

    const secured=new Response(response.body,{
      status:response.status,
      statusText:response.statusText,
      headers
    });

    if(!url.pathname.startsWith("/api/admin/")) {
      ctx.waitUntil(
        recordVisit(env,req,response.status).catch(()=>{})
      );
    }

    return secured;
  }
};
