import { LoginForm } from "@/components/admin-editor";

export default function LoginPage() {
  return <div className="admin-login">
    <section className="admin-login-card">
      <span className="admin-eyebrow">تحریریهٔ هم‌قدم</span>
      <h1>ورود به مدیریت</h1>
      <p className="admin-muted">برای مدیریت نوشته‌ها و صفحهٔ اصلی وارد شوید.</p>
      <LoginForm />
      <a className="admin-back-link" href="/">بازگشت به سایت ←</a>
    </section>
  </div>;
}
