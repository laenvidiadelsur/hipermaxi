import { BarChart3, DollarSign, UserCheck, Users, Settings, MessageSquare, LogOut, Building2, CreditCard, ShieldCheck, SendHorizonal, SendToBack } from "lucide-react";
import { Link, useLocation } from "react-router";
import { useAuth } from "../context/AuthContext";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import NotificationBell from "./notifications/NotificationBell";

interface SidebarProps {
  children: React.ReactNode;
}

export function Layout({ children }: SidebarProps) {
  const location = useLocation();
  const { dbUser, signOut, workspaces, activeWorkspaceId, switchWorkspace } = useAuth();

  const menuItems = [
    { path: "/cobranzas", label: "Dashboard Cobranzas", icon: DollarSign },
    { path: "/deudas", label: "Gestión de Deudas", icon: BarChart3 },
    { path: "/mensajeria/dashboard", label: "Dashboard Mensajería", icon: SendHorizonal },
    { path: "/bandeja", label: "Bandeja", icon: MessageSquare },
    { path: "/mensajeria/masivos", label: "Envíos Masivos", icon: SendToBack },
    { path: "/contactos", label: "Contactos", icon: UserCheck },
    { path: "/usuarios", label: "Usuarios", icon: Users },
    { path: "/configuracion", label: "Configuración", icon: Settings },
  ];

  const adminItems = [
    { path: "/admin/tenants", label: "Tenants", icon: Building2 },
    { path: "/admin/accesos", label: "Accesos", icon: ShieldCheck },
    { path: "/admin/suscripciones", label: "Suscripciones", icon: CreditCard },
  ];

  const isSuperadmin = dbUser?.role === "Superadmin";

  const handleSignOut = async () => {
    await signOut();
    toast.info("Sesión cerrada");
  };

  const initials = dbUser?.name
    ? dbUser.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "AI";

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center gap-3 mb-1">
            <div className="size-10 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shrink-0">
              <DollarSign className="size-6 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-xl text-slate-900">Ribentek</h1>
              <p className="text-sm text-slate-600">AI Cobranzas</p>
            </div>
          </div>

          <div className="mt-4">
            <Select value={activeWorkspaceId ?? undefined} onValueChange={switchWorkspace}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleccionar workspace" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((workspace) => (
                  <SelectItem key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <ul className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                location.pathname === item.path ||
                (item.path !== "/" && location.pathname.startsWith(item.path));

              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <Icon className="size-5" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {isSuperadmin && (
            <>
              <div className="mt-4 mb-2 px-4 flex items-center gap-2">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400 font-medium">ADMIN</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
              <ul className="space-y-1">
                {adminItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname.startsWith(item.path);
                  return (
                    <li key={item.path}>
                      <Link
                        to={item.path}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                          isActive
                            ? "bg-purple-50 text-purple-700 font-medium"
                            : "text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        <Icon className="size-5" />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-200">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="size-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <span className="text-sm font-semibold text-blue-700">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{dbUser?.name ?? "Administrador"}</p>
              <p className="text-xs text-slate-500 truncate">{dbUser?.email ?? ""}</p>
            </div>
            <button
              onClick={handleSignOut}
              title="Cerrar sesión"
              className="text-slate-400 hover:text-red-500 transition-colors"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="px-8 pt-5 pb-3 flex items-center justify-end">
          <NotificationBell />
        </div>
        <div className="px-8 pb-8">{children}</div>
      </main>
    </div>
  );
}
