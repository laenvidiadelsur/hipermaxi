// Datos mock para el sistema de gestión de agentes IA

export interface Lead {
  id: string;
  nombre: string;
  contacto: string;
  origen: string;
  estado: "Nuevo" | "En proceso" | "Derivado" | "Cerrado";
  asignadoA: "IA Comercial" | "IA Cobranzas" | "Agente Humano";
  ultimaInteraccion: string;
  fechaCreacion: string;
  notas: string;
  timeline: TimelineEvent[];
  citaAgendada?: {
    fecha: string;
    hora: string;
    fechaCompleta: Date;
  };
}

export interface TimelineEvent {
  fecha: string;
  tipo: "IA" | "Humano";
  descripcion: string;
  agente: string;
}

export interface Contact {
  id: string;
  nombre: string;
  contacto: string;
  tipoConversion: "Cita" | "Venta" | "Pago";
  fechaConversion: string;
  leadOriginalId: string;
}

export interface Agent {
  id: string;
  nombre: string;
  tipo: "Comercial" | "Cobranzas";
  conversacionesAtendidas: number;
  tasaExito: number;
  tasaDerivacion: number;
}

export interface DashboardStats {
  totalLeads: number;
  leadsAtendidosIA: number;
  leadsDerivados: number;
  tasaConversion: number;
}

export interface DailyVolume {
  fecha: string;
  comercial: number;
  cobranzas: number;
}

export interface PerformanceData {
  categoria: string;
  agenteIA: number;
  agenteHumano: number;
}

// Datos mock
export const mockLeads: Lead[] = [
  {
    id: "L001",
    nombre: "María González",
    contacto: "+52 555 1234 5678",
    origen: "WhatsApp",
    estado: "En proceso",
    asignadoA: "IA Comercial",
    ultimaInteraccion: "2026-03-30 10:30",
    fechaCreacion: "2026-03-30",
    notas: "Interesada en productos premium",
    citaAgendada: {
      fecha: "Hoy",
      hora: "16:00",
      fechaCompleta: new Date("2026-03-30T16:00:00"),
    },
    timeline: [
      {
        fecha: "2026-03-30 10:30",
        tipo: "IA",
        descripcion: "Primer contacto establecido",
        agente: "IA Comercial",
      },
    ],
  },
  {
    id: "L002",
    nombre: "Carlos Mendoza",
    contacto: "carlos.m@email.com",
    origen: "Página Web",
    estado: "En proceso",
    asignadoA: "IA Comercial",
    ultimaInteraccion: "2026-03-29 15:45",
    fechaCreacion: "2026-03-28",
    notas: "Solicitó información sobre precios",
    citaAgendada: {
      fecha: "Mañana",
      hora: "10:30",
      fechaCompleta: new Date("2026-03-31T10:30:00"),
    },
    timeline: [
      {
        fecha: "2026-03-28 09:00",
        tipo: "IA",
        descripcion: "Lead capturado desde formulario web",
        agente: "IA Comercial",
      },
      {
        fecha: "2026-03-29 15:45",
        tipo: "IA",
        descripcion: "Envío de catálogo de productos",
        agente: "IA Comercial",
      },
    ],
  },
  {
    id: "L003",
    nombre: "Ana Rodríguez",
    contacto: "+52 555 9876 5432",
    origen: "Facebook",
    estado: "Derivado",
    asignadoA: "Agente Humano",
    ultimaInteraccion: "2026-03-29 11:20",
    fechaCreacion: "2026-03-27",
    notas: "Consulta compleja sobre financiamiento",
    citaAgendada: {
      fecha: "01 Abr",
      hora: "14:00",
      fechaCompleta: new Date("2026-04-01T14:00:00"),
    },
    timeline: [
      {
        fecha: "2026-03-27 14:00",
        tipo: "IA",
        descripcion: "Contacto inicial por Facebook Messenger",
        agente: "IA Comercial",
      },
      {
        fecha: "2026-03-28 10:00",
        tipo: "IA",
        descripcion: "Consulta sobre opciones de financiamiento",
        agente: "IA Comercial",
      },
      {
        fecha: "2026-03-29 11:20",
        tipo: "Humano",
        descripcion: "Derivado a especialista en crédito",
        agente: "Juan Pérez",
      },
    ],
  },
  {
    id: "L004",
    nombre: "Roberto Silva",
    contacto: "roberto.silva@company.com",
    origen: "LinkedIn",
    estado: "Cerrado",
    asignadoA: "IA Comercial",
    ultimaInteraccion: "2026-03-25 16:00",
    fechaCreacion: "2026-03-20",
    notas: "Convertido en cliente - Compra realizada",
    timeline: [
      {
        fecha: "2026-03-20 08:30",
        tipo: "IA",
        descripcion: "Prospecto contactado vía LinkedIn",
        agente: "IA Comercial",
      },
      {
        fecha: "2026-03-22 12:00",
        tipo: "IA",
        descripcion: "Seguimiento y envío de propuesta",
        agente: "IA Comercial",
      },
      {
        fecha: "2026-03-25 16:00",
        tipo: "IA",
        descripcion: "Compra confirmada - Lead cerrado exitosamente",
        agente: "IA Comercial",
      },
    ],
  },
  {
    id: "L005",
    nombre: "Patricia Vargas",
    contacto: "+52 555 2468 1357",
    origen: "Referido",
    estado: "En proceso",
    asignadoA: "IA Cobranzas",
    ultimaInteraccion: "2026-03-30 09:15",
    fechaCreacion: "2026-03-29",
    notas: "Pago pendiente - Plan de pagos solicitado",
    timeline: [
      {
        fecha: "2026-03-29 10:00",
        tipo: "IA",
        descripcion: "Contacto por pago vencido",
        agente: "IA Cobranzas",
      },
      {
        fecha: "2026-03-30 09:15",
        tipo: "IA",
        descripcion: "Negociación de plan de pagos",
        agente: "IA Cobranzas",
      },
    ],
  },
  {
    id: "L006",
    nombre: "Luis Fernández",
    contacto: "luis.f@mail.com",
    origen: "WhatsApp",
    estado: "Nuevo",
    asignadoA: "IA Comercial",
    ultimaInteraccion: "2026-03-30 12:00",
    fechaCreacion: "2026-03-30",
    notas: "Primera consulta sobre servicios",
    timeline: [
      {
        fecha: "2026-03-30 12:00",
        tipo: "IA",
        descripcion: "Consulta inicial sobre servicios",
        agente: "IA Comercial",
      },
    ],
  },
];

export const mockContacts: Contact[] = [
  {
    id: "C001",
    nombre: "Roberto Silva",
    contacto: "roberto.silva@company.com",
    tipoConversion: "Venta",
    fechaConversion: "2026-03-25",
    leadOriginalId: "L004",
  },
  {
    id: "C002",
    nombre: "Carmen Torres",
    contacto: "+52 555 3333 4444",
    tipoConversion: "Cita",
    fechaConversion: "2026-03-24",
    leadOriginalId: "L007",
  },
  {
    id: "C003",
    nombre: "Jorge Ramírez",
    contacto: "jorge.ramirez@email.com",
    tipoConversion: "Pago",
    fechaConversion: "2026-03-23",
    leadOriginalId: "L008",
  },
];

export const mockAgents: Agent[] = [
  {
    id: "A001",
    nombre: "IA Comercial",
    tipo: "Comercial",
    conversacionesAtendidas: 156,
    tasaExito: 68.5,
    tasaDerivacion: 12.3,
  },
  {
    id: "A002",
    nombre: "IA Cobranzas",
    tipo: "Cobranzas",
    conversacionesAtendidas: 89,
    tasaExito: 71.2,
    tasaDerivacion: 8.7,
  },
];

export const mockDashboardStats: DashboardStats = {
  totalLeads: 245,
  leadsAtendidosIA: 215,
  leadsDerivados: 30,
  tasaConversion: 42.8,
};

export const mockDailyVolume: DailyVolume[] = [
  { fecha: "24 Mar", comercial: 12, cobranzas: 8 },
  { fecha: "25 Mar", comercial: 18, cobranzas: 6 },
  { fecha: "26 Mar", comercial: 15, cobranzas: 10 },
  { fecha: "27 Mar", comercial: 22, cobranzas: 12 },
  { fecha: "28 Mar", comercial: 20, cobranzas: 9 },
  { fecha: "29 Mar", comercial: 25, cobranzas: 14 },
  { fecha: "30 Mar", comercial: 19, cobranzas: 11 },
];

export const mockPerformanceData: PerformanceData[] = [
  { categoria: "Semana 1", agenteIA: 145, agenteHumano: 32 },
  { categoria: "Semana 2", agenteIA: 138, agenteHumano: 38 },
  { categoria: "Semana 3", agenteIA: 152, agenteHumano: 29 },
  { categoria: "Semana 4", agenteIA: 160, agenteHumano: 35 },
];