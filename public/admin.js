
const box = document.querySelector("#adminContent");
const loginPanel = document.querySelector("#loginPanel");
const dashboard = document.querySelector("#dashboard");
const loginForm = document.querySelector("#loginForm");
const passwordInput = document.querySelector("#adminPassword");
const loginMessage = document.querySelector("#loginMessage");
const logoutButton = document.querySelector("#logoutButton");

async function api(path, opts = {}) {
  const r = await fetch(path, {
    ...opts,
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...(opts.headers || {})
    }
  });

  const d = await r.json().catch(() => ({}));

  if (!r.ok) throw Error(d.error || r.status);
  return d;
}

function showLogin(message = "") {
  loginPanel.hidden = false;
  dashboard.hidden = true;
  loginMessage.textContent = message;
  passwordInput.value = "";
}

function showDashboard() {
  loginPanel.hidden = true;
  dashboard.hidden = false;
}

async function checkLogin() {
  try {
    const d = await api("/api/admin/me");
    if (d.authenticated) {
      showDashboard();
      tab("dashboard");
    } else {
      showLogin();
    }
  } catch {
    showLogin("登录状态检查失败，请重新登录。");
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "正在登录……";

  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: passwordInput.value })
    });

    passwordInput.value = "";
    showDashboard();
    await tab("dashboard");
  } catch (e) {
    showLogin(e.message || "登录失败");
  }
});

logoutButton.addEventListener("click", async () => {
  try {
    await api("/api/admin/logout", { method: "POST" });
  } finally {
    showLogin("已退出登录。");
  }
});

function row(title, body) {
  const e = document.createElement("div");
  e.className = "row";

  const h = document.createElement("b");
  h.textContent = title;

  const p = document.createElement("pre");
  p.textContent = JSON.stringify(body, null, 2);

  e.append(h, p);
  return e;
}

async function tab(name) {
  box.replaceChildren();

  try {
    if (name === "reports") {
      const d = await api("/api/admin/reports");

      d.reports.forEach(r => {
        const e = row(`举报 ${r.id} · ${r.status}`, {
          举报者: r.reporter_id,
          目标用户: r.target_user_id,
          理由: r.reason,
          时间: new Date(r.created_at).toLocaleString()
        });

        if (r.status === "pending") {
          const b = document.createElement("button");
          b.textContent = "警告并处理";

          b.onclick = async () => {
            const note = prompt("给被举报者的说明");
            if (note === null) return;

            await api("/api/admin/report/resolve", {
              method: "POST",
              body: JSON.stringify({
                reportId: r.id,
                action: "warning",
                publicResult: "举报已审核，已发出警告。",
                targetNote: note,
                reporterNote: "感谢举报，管理员已审核。",
                reason: "违反社区规则"
              })
            });

            tab(name);
          };

          e.append(b);
        }

        box.append(e);
      });
    } else {
      const endpoint = {
        dashboard: "/api/admin/security",
        visitors: "/api/admin/visitors",
        security: "/api/admin/security",
        sanctions: "/api/admin/sanctions"
      }[name];

      const d = await api(endpoint);

      Object.entries(d).forEach(([k, v]) => {
        if (Array.isArray(v)) {
          v.forEach(x => box.append(row(k, x)));
        }
      });
    }
  } catch (e) {
    box.textContent = `加载失败：${e.message}`;
    if (e.message === "Access denied") showLogin("登录已失效，请重新登录。");
  }
}

document.querySelectorAll("[data-tab]").forEach(b => {
  b.addEventListener("click", () => tab(b.dataset.tab));
});

checkLogin();
