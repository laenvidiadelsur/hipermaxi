import React from "react";
import { createBrowserRouter, Navigate } from "react-router";
import { Layout } from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Setup from "./pages/Setup";
import InvitePage from "./pages/Invite";
import DashboardCobranzas from "./pages/DashboardCobranzas";
import { GestionDeudas } from "./pages/GestionDeudas";
import { Bandeja } from "./pages/Bandeja";
import MessagingDashboard from "./pages/MessagingDashboard";
import MassSends from "./pages/MassSends";
import Contactos from "./pages/Contactos";
import Usuarios from "./pages/Usuarios";
import Configuracion from "./pages/Configuracion";
import AdminTenants from "./pages/admin/Tenants";
import AdminAccesos from "./pages/admin/Accesos";
import AdminSuscripciones from "./pages/admin/Suscripciones";

export const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  { path: "/reset-password", element: <ResetPassword /> },
  { path: "/setup", element: <Setup /> },
  { path: "/invite", element: <InvitePage /> },
  { path: "/", element: <Navigate to="/cobranzas" replace /> },
  { path: "/cobranzas", element: <ProtectedRoute><Layout><DashboardCobranzas /></Layout></ProtectedRoute> },
  { path: "/deudas", element: <ProtectedRoute><Layout><GestionDeudas /></Layout></ProtectedRoute> },
  { path: "/mensajeria/dashboard", element: <ProtectedRoute><Layout><MessagingDashboard /></Layout></ProtectedRoute> },
  { path: "/mensajeria/masivos", element: <ProtectedRoute><Layout><MassSends /></Layout></ProtectedRoute> },
  { path: "/mensajeria/bandeja", element: <Navigate to="/bandeja" replace /> },
  { path: "/bandeja", element: <ProtectedRoute><Layout><Bandeja /></Layout></ProtectedRoute> },
  { path: "/contactos", element: <ProtectedRoute><Layout><Contactos /></Layout></ProtectedRoute> },
  { path: "/usuarios", element: <ProtectedRoute requiredRole="Admin"><Layout><Usuarios /></Layout></ProtectedRoute> },
  { path: "/configuracion", element: <ProtectedRoute requiredRole="Admin"><Layout><Configuracion /></Layout></ProtectedRoute> },
  { path: "/admin/tenants", element: <ProtectedRoute requiredRole="Superadmin" roleScope="global"><Layout><AdminTenants /></Layout></ProtectedRoute> },
  { path: "/admin/accesos", element: <ProtectedRoute requiredRole="Superadmin" roleScope="global"><Layout><AdminAccesos /></Layout></ProtectedRoute> },
  { path: "/admin/suscripciones", element: <ProtectedRoute requiredRole="Superadmin" roleScope="global"><Layout><AdminSuscripciones /></Layout></ProtectedRoute> },
  { path: "*", element: <Navigate to="/cobranzas" replace /> },
]);
