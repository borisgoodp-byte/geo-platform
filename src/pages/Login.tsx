import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { AlertCircle, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/providers/auth'
import { DEMO_ACCOUNTS, getDefaultLanding } from '@/lib/auth'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

export default function Login() {
  const { login, usingMockFallback } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [fieldErr, setFieldErr] = useState<{ email?: string; password?: string }>({})
  const [formErr, setFormErr] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const next: typeof fieldErr = {}
    if (!email.trim()) next.email = '请填写账号'
    if (!password) next.password = '请填写密码'
    setFieldErr(next)
    if (Object.keys(next).length) return

    setPending(true)
    setFormErr(null)
    try {
      const user = await login(email.trim(), password)
      const landing = getDefaultLanding(user)
      const from = params.get('from')
      if (
        from &&
        from.startsWith('/') &&
        !from.startsWith('//') &&
        user.role !== 'client'
      ) {
        navigate(from, { replace: true })
      } else {
        navigate(landing, { replace: true })
      }
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : '邮箱或密码错误')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#f9fafb] px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex justify-center">
          <img src="/logo-geomon.svg" alt="GeoMon" className="h-8 w-auto" />
        </div>

        <div className="rounded-xl border border-[#e5e7eb] bg-white p-8 shadow-sm">
          <h1 className="text-center text-[20px] font-semibold text-[#111827]">登录 GeoMon</h1>
          <p className="mt-1.5 text-center text-sm text-[#6b7280]">使用分配的账号进入对应工作台</p>

          <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
            {formErr && (
              <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-700">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{formErr}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[#374151]">
                账号
              </Label>
              <Input
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => {
                  if (!email.trim()) setFieldErr((f) => ({ ...f, email: '请填写账号' }))
                  else setFieldErr((f) => ({ ...f, email: undefined }))
                }}
                placeholder="手机号或邮箱"
                className={cn(
                  'h-10 rounded-lg',
                  fieldErr.email && 'border-red-500 focus-visible:ring-red-200',
                )}
                autoComplete="username"
              />
              {fieldErr.email && <p className="text-xs text-red-600">{fieldErr.email}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[#374151]">
                密码
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => {
                    if (!password) setFieldErr((f) => ({ ...f, password: '请填写密码' }))
                    else setFieldErr((f) => ({ ...f, password: undefined }))
                  }}
                  placeholder="请输入密码"
                  className={cn(
                    'h-10 rounded-lg pr-10',
                    fieldErr.password && 'border-red-500 focus-visible:ring-red-200',
                  )}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#6b7280]"
                  onClick={() => setShowPwd((v) => !v)}
                  aria-label={showPwd ? '隐藏密码' : '显示密码'}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {fieldErr.password && <p className="text-xs text-red-600">{fieldErr.password}</p>}
            </div>

            <Button
              type="submit"
              disabled={pending}
              className="h-10 w-full rounded-lg bg-brand text-white hover:bg-brand-deep"
            >
              {pending ? (
                <>
                  <Spinner className="size-4" />
                  登录中…
                </>
              ) : (
                '登录'
              )}
            </Button>
          </form>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-[#9ca3af]">
            演示账号：{DEMO_ACCOUNTS.map((a) => a.email).join(' / ')}
            <br />
            密码统一 {DEMO_ACCOUNTS[0].password}
            {usingMockFallback && (
              <>
                <br />
                （当前为本地 mock 回退，后端会话未接通）
              </>
            )}
          </p>

          <p className="mt-5 text-center text-xs text-[#6b7280]">账号由项目负责人开通</p>
        </div>
      </div>
    </div>
  )
}
