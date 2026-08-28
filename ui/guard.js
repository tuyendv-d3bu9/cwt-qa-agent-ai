// ui/guard.js
// R5.3 — LỚP CHẶN của máy chủ UI. Tách riêng vì đây là chỗ dễ sai nhất và phải test được
// mà không cần dựng server.
//
// Máy chủ này **ghi file trong repo, sinh tiến trình con, và mở được trình duyệt thật**.
// Không xác thực thì BẤT KỲ trang web nào đang mở trên máy đó cũng gọi được nó: một tab quảng
// cáo có thể `fetch('http://127.0.0.1:5179/api/run', {method:'POST'})` và chạy pipeline của bạn.
//
// Bốn lớp, mỗi lớp chặn một kiểu tấn công khác nhau — thiếu lớp nào cũng thủng:
//
//   1. bind 127.0.0.1   máy khác trong mạng không nối tới được
//   2. token            trang web khác không đoán được URL đầy đủ
//   3. Origin/Host      chặn DNS-rebinding: kẻ tấn công trỏ tên miền của họ về 127.0.0.1,
//                       lúc đó trình duyệt coi request là same-origin và GỬI KÈM token
//   4. POST cho mọi ghi GET không được đổi trạng thái — `<img src>` cũng là một GET

import { timingSafeEqual, randomBytes } from "node:crypto";

/** Token ngẫu nhiên cho MỘT lần khởi động. Không lưu ra đĩa, không tái sử dụng. */
export function newToken() {
    return randomBytes(24).toString("base64url");
}

/** So sánh chuỗi không rò rỉ thời gian. Độ dài khác nhau → sai, không cần so tiếp. */
export function tokenMatches(want, got) {
    const a = Buffer.from(String(want ?? ""), "utf8");
    const b = Buffer.from(String(got ?? ""), "utf8");
    if (a.length === 0 || a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}

/** Đường dẫn được phép đọc — mọi thứ khác bị từ chối, kể cả khi có token đúng. */
const READABLE_PREFIXES = [".qa-run/", "project-docs/", "memory/", "flows/", "tests/"];

/**
 * Chuẩn hoá + kiểm một đường dẫn do trình duyệt gửi lên.
 *
 * Có token rồi vẫn phải kiểm: token chứng minh "đúng người", không chứng minh "đúng file".
 * `?path=../../.env` từ chính tab UI của bạn vẫn là đọc trộm khoá API.
 *
 * @returns {{ok: true, path: string} | {ok: false, why: string}}
 */
export function safeReadPath(raw) {
    const p = String(raw ?? "").split("\\").join("/").replace(/^\.\//, "");
    if (!p) return { ok: false, why: "thiếu đường dẫn" };
    // Chặn TRƯỚC khi resolve: `..` ở bất kỳ đâu trong chuỗi đều là ý định đi ra ngoài.
    if (p.includes("..")) return { ok: false, why: "đường dẫn chứa `..`" };
    if (p.startsWith("/") || /^[A-Za-z]:/.test(p)) return { ok: false, why: "phải là đường dẫn tương đối" };
    if (p.includes("\0")) return { ok: false, why: "đường dẫn chứa ký tự null" };
    if (!READABLE_PREFIXES.some(pre => p.startsWith(pre))) {
        return { ok: false, why: `chỉ đọc được trong: ${READABLE_PREFIXES.join(", ")}` };
    }
    return { ok: true, path: p };
}

/**
 * `Origin` / `Host` hợp lệ chưa.
 *
 * DNS-rebinding: kẻ tấn công cho `evil.com` trỏ về `127.0.0.1`. Trình duyệt lúc đó gửi
 * `Host: evil.com` tới máy chủ này, và vì cùng "origin" nên nó gửi kèm cả cookie/token nếu có.
 * Chỉ chấp nhận Host là địa chỉ loopback thì tên miền lạ bị loại ngay.
 */
export function originAllowed({ origin, host, allowHosts = null }) {
    const hostName = String(host ?? "").split(":")[0].toLowerCase();
    const loopback = hostName === "127.0.0.1" || hostName === "localhost" || hostName === "[::1]" || hostName === "::1";
    if (!loopback && !(allowHosts ?? []).includes(hostName)) {
        return { ok: false, why: `Host "${host}" không phải loopback (chặn DNS-rebinding)` };
    }
    // Không có Origin = request không phải từ trang web (mở thẳng URL, hoặc curl) → cho qua;
    // token vẫn phải đúng. Có Origin thì nó phải trỏ về chính máy chủ này.
    if (origin) {
        let o;
        try { o = new URL(origin); } catch { return { ok: false, why: `Origin "${origin}" không hợp lệ` }; }
        const oh = o.hostname.toLowerCase();
        const okHost = oh === "127.0.0.1" || oh === "localhost" || oh === "::1" || (allowHosts ?? []).includes(oh);
        if (!okHost) return { ok: false, why: `Origin "${origin}" không được phép` };
    }
    return { ok: true };
}

/**
 * Endpoint CHỈ để ghi — bắt buộc POST. `<img src="/api/run?token=…">` trên một trang bất kỳ
 * cũng là một GET, nên GET không bao giờ được đổi trạng thái.
 */
export const WRITE_ROUTES = Object.freeze(["/api/run", "/api/stop", "/api/approve"]);

/**
 * Endpoint VỪA đọc VỪA ghi: GET để xem, POST để lưu.
 *
 * Tách khỏi `WRITE_ROUTES` vì bản đầu gộp chung và chặn luôn cả GET — màn hình "Câu hỏi" gọi
 * `GET /api/gaps` để hiện các câu hỏi và nhận `405 phải gọi bằng POST`, nên **không bao giờ tải
 * được**. Bộ test bảo mật vẫn xanh (nó chỉ kiểm rằng GET bị chặn), lỗi lộ ra khi chạy thật.
 *
 * Luật "ghi phải POST" KHÔNG bị nới: handler chỉ ghi ở nhánh POST.
 */
export const READ_WRITE_ROUTES = Object.freeze(["/api/gaps"]);

/**
 * Một cửa duy nhất cho mọi request. Trả `null` = cho đi tiếp.
 *
 * @returns {{status: number, body: string} | null}
 */
export function checkRequest({ method, url, headers, token, allowHosts = null }) {
    const u = new URL(url, "http://127.0.0.1");

    const o = originAllowed({ origin: headers?.origin, host: headers?.host, allowHosts });
    if (!o.ok) return { status: 403, body: o.why };

    // Token lấy từ query (?token=) hoặc header — query để dán được URL vào trình duyệt.
    const got = u.searchParams.get("token") ?? headers?.["x-qa-token"];
    if (!tokenMatches(token, got)) {
        return { status: 401, body: "token sai hoặc thiếu. Mở đúng URL mà `node qa.js ui` đã in ra." };
    }

    if (WRITE_ROUTES.includes(u.pathname) && method !== "POST") {
        return { status: 405, body: `${u.pathname} phải gọi bằng POST` };
    }
    if (READ_WRITE_ROUTES.includes(u.pathname) && method !== "GET" && method !== "POST") {
        return { status: 405, body: `${u.pathname} chỉ nhận GET (xem) hoặc POST (lưu)` };
    }
    return null;
}
