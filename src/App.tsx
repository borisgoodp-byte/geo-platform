import { Navigate, Route, Routes } from 'react-router'
import Layout from '@/components/Layout'
import { RedirectIfAuthed, RequireAuth, RequireRoleAccess } from '@/components/RequireAuth'
import Home from '@/pages/Home'
import Login from '@/pages/Login'
import ProjectOverview from '@/pages/ProjectOverview'
import DiagnosisNew from '@/pages/DiagnosisNew'
import Scoring from '@/pages/Scoring'
import Findings from '@/pages/Findings'
import DiagnosisReport from '@/pages/DiagnosisReport'
import DiagnosisReportsList from '@/pages/DiagnosisReportsList'
import Quote from '@/pages/Quote'
import Schedule from '@/pages/Schedule'
import Pool from '@/pages/Pool'
import Measure from '@/pages/Measure'
import Collection from '@/pages/Collection'
import Dashboard from '@/pages/Dashboard'
import Compete from '@/pages/Compete'
import Reports from '@/pages/Reports'

/**
 * 路由契约：Layout 渲染 <Outlet/>（嵌套路由模式）。
 * RequireAuth 挡未登录；RequireRoleAccess 挡越权（空态非裸 403）。
 * 报告页脱离工作台骨架，仍需鉴权。
 */
export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfAuthed>
            <Login />
          </RedirectIfAuthed>
        }
      />

      <Route element={<RequireAuth />}>
        <Route element={<RequireRoleAccess />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/projects/:id" element={<ProjectOverview />} />
            <Route path="/projects/:id/diagnosis/new" element={<DiagnosisNew />} />
            <Route path="/projects/:id/diagnosis/:dId/scoring" element={<Scoring />} />
            <Route path="/projects/:id/diagnosis/:dId/findings" element={<Findings />} />
            <Route path="/projects/:id/diagnosis/reports" element={<DiagnosisReportsList />} />
            <Route path="/projects/:id/quote" element={<Quote />} />
            <Route path="/projects/:id/schedule" element={<Schedule />} />
            <Route path="/projects/:id/pool" element={<Pool />} />
            <Route path="/projects/:id/measure" element={<Measure />} />
            <Route path="/projects/:id/collection" element={<Collection />} />
            <Route path="/projects/:id/dashboard" element={<Dashboard />} />
            <Route path="/projects/:id/compete" element={<Compete />} />
            <Route path="/projects/:id/reports" element={<Reports />} />
          </Route>
          {/* 报告页：无 Layout，独占全屏 */}
          <Route path="/projects/:id/diagnosis/:dId/report" element={<DiagnosisReport />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
