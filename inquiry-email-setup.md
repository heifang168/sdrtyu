# heifun6.asia 询盘邮箱绑定说明

## 当前目标

把网站询盘收件邮箱改为：

```text
ge50613386@gmail.com
```

## 已完成的本地修改

- 所有 `data-rfq-form` 和 `data-inquiry-form` 表单已绑定：

```html
action="https://formsubmit.co/ge50613386@gmail.com"
method="POST"
```

- 表单已添加：

```html
_subject = New ALEO POWER inquiry from heifun6.asia
_template = table
_captcha = false
_next = https://www.heifun6.asia/thank-you/
```

- `app.js` 已从旧的 `mailto:sales@aleopower.com` 改为表单校验通过后原生提交。
- 已新增提交成功页：

```text
/thank-you/
```

## 重要说明

当前正式域名 `https://www.heifun6.asia/contact/index.html` 仍显示：

```text
https://formsubmit.co/50613386@qq.com
```

说明正式域名还没有同步本地这次改动。

本地项目已用 Vercel CLI 部署到：

```text
https://files-mentioned-by-the-user-aleo.vercel.app
```

但部署输出没有显示 `www.heifun6.asia` 已绑定到这个 Vercel 项目，所以正式域名仍是旧版本。

## 第一次测试流程

1. 部署并确认正式域名页面源码里出现：

```text
formsubmit.co/ge50613386@gmail.com
```

2. 打开：

```text
https://www.heifun6.asia/contact/
```

3. 填写测试询盘并提交。
4. 打开 `ge50613386@gmail.com` 收件箱。
5. 第一次通常会收到 FormSubmit 的确认邮件，需要点击确认。
6. 确认后再提交第二次测试询盘，才会收到真实询盘内容。

## 推荐后续升级

FormSubmit 适合静态站快速上线。如果后期正式投流，建议升级为：

- Vercel Serverless Function
- Resend / Brevo / SendGrid
- Google reCAPTCHA / Turnstile
- 询盘同时写入 Google Sheet 或 CRM

