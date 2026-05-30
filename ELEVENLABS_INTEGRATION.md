# Integración de ElevenLabs AI en el Portal Hipermaxi

Este documento explica cómo el Asistente Conversacional de Inteligencia Artificial (ElevenLabs) ha sido integrado en el sistema frontend de React, permitiéndole no solo hablar con el usuario, sino también "ver" el estado de la aplicación y "controlar" la navegación web.

## Arquitectura General

La integración utiliza el **Widget Web Component de ElevenLabs** (`<elevenlabs-convai>`). En lugar de limitarnos a una simple ventana de chat, hemos acoplado el widget directamente con el ciclo de vida de React y el enrutador (`react-router-dom`). 

El ecosistema se divide en 3 partes:
1. **El Script Base:** Descarga el widget desde la red.
2. **Layout Global (`App.jsx`):** Renderiza el botón flotante para que persista en todas las páginas e inyecta herramientas de navegación.
3. **Controladores de Vista (`ProductForm.jsx`):** Inyectan herramientas específicas de la pantalla actual para que el bot pueda leer formularios o mostrar errores visuales.

---

## 1. Script Base (index.html)

El script de ElevenLabs se descarga de forma asíncrona directamente en la cabecera de la aplicación para garantizar que el Custom Element (`<elevenlabs-convai>`) esté registrado en el navegador antes de que React intente renderizarlo.

```html
<!-- index.html -->
<head>
  <script src="https://unpkg.com/@elevenlabs/convai-widget-embed" async type="text/javascript"></script>
</head>
```

---

## 2. Layout Global y Navegación Controlada por IA (`App.jsx`)

Para evitar que una llamada de voz se corte cuando el usuario cambia de página, el widget se renderiza en la raíz de la aplicación, por fuera del `<Routes>`.

Aquí capturamos el evento `elevenlabs-convai:call` para registrar la herramienta global `redirigir_pagina`. Cuando el Agente decide cambiar la página web, React Router (`useNavigate`) ejecuta el salto de pantalla.

```jsx
// src/App.jsx
import React, { useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';

export default function App() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleGlobalCall = (event) => {
      // Inyectar Client Tools Globales
      if (!event.detail.config.clientTools) event.detail.config.clientTools = {};
      
      // Herramienta 1: Navegación Web
      event.detail.config.clientTools.redirigir_pagina = async ({ ruta }) => {
        if (ruta) navigate(ruta);
        return { exito: true };
      };
    };

    // Anclar el listener al Web Component
    const attachGlobalListener = setInterval(() => {
      const widget = document.querySelector('elevenlabs-convai');
      if (widget) {
        widget.addEventListener('elevenlabs-convai:call', handleGlobalCall);
        clearInterval(attachGlobalListener);
      }
    }, 500);

    return () => {
      clearInterval(attachGlobalListener);
      const widget = document.querySelector('elevenlabs-convai');
      if (widget) widget.removeEventListener('elevenlabs-convai:call', handleGlobalCall);
    };
  }, [navigate]);

  return (
    <>
      <elevenlabs-convai agent-id="agent_4801ksx0pvn6fz2sn7a7ejxp8dn3"></elevenlabs-convai>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/crear-producto" element={<ProductForm />} />
      </Routes>
    </>
  );
}
```

---

## 3. Interacción con Formularios y UI (`ProductForm.jsx`)

Cuando el usuario entra a la pantalla de crear producto, el componente inyecta una nueva herramienta (`check_form_status`) al mismo evento `elevenlabs-convai:call`. 

Esta herramienta permite que el Agente "lea" el estado de React (gracias a `useRef`) y desencadene animaciones CSS (`setFormErrors`) para resaltar en rojo los campos vacíos de forma autónoma.

```jsx
// src/pages/ProductForm.jsx
import React, { useState, useEffect, useRef } from 'react';

export default function ProductForm() {
  const [formData, setFormData] = useState({ descripcion: '', codigoBarra: '', precio: '', imagen: null });
  const [formErrors, setFormErrors] = useState([]);
  
  // Ref para mantener el estado actualizado dentro de la función asíncrona
  const formDataRef = useRef(formData);
  useEffect(() => { formDataRef.current = formData; }, [formData]);

  useEffect(() => {
    const handleCheckForm = (event) => {
      if (!event.detail.config.clientTools) event.detail.config.clientTools = {};
      
      // Herramienta 2: Lectura de Formulario y Animación UI
      event.detail.config.clientTools.check_form_status = async () => {
        const currentData = formDataRef.current;
        let camposVacios = [];
        
        if (!currentData.descripcion) camposVacios.push("Descripción");
        if (!currentData.codigoBarra) camposVacios.push("Código de Barra");
        if (!currentData.precio) camposVacios.push("Precio");
        if (!currentData.imagen) camposVacios.push("Imagen");

        // Reactividad: La IA dispara una animación visual en la UI
        setFormErrors(camposVacios);

        // Retorno: El agente recibe estos datos para formular su respuesta de voz
        return {
          campos_incompletos: camposVacios,
          puede_guardar: camposVacios.length === 0
        };
      };
    };

    const attachListener = setInterval(() => {
      const widget = document.querySelector('elevenlabs-convai');
      if (widget) {
        widget.addEventListener('elevenlabs-convai:call', handleCheckForm);
        clearInterval(attachListener);
      }
    }, 500);

    return () => {
      clearInterval(attachListener);
      const widget = document.querySelector('elevenlabs-convai');
      if (widget) widget.removeEventListener('elevenlabs-convai:call', handleCheckForm);
    };
  }, []);

  return (
    // ... Código HTML del formulario ...
  );
}
```

---

## 4. Requisitos en el Dashboard de ElevenLabs

Para que este código funcione, es obligatorio que el Agente configurado en ElevenLabs posea estas 2 herramientas registradas en su base de datos:

| Nombre | Parámetros | Propósito |
| :--- | :--- | :--- |
| `redirigir_pagina` | `ruta` (String) | Permite al agente enviar al usuario a `/crear-producto`. |
| `check_form_status` | *(Ninguno)* | Lee la pantalla actual y resalta campos con errores visuales. |

**System Prompt Recomendado:**
> "Eres un asistente visual. Usa la herramienta `redirigir_pagina` para navegar por la aplicación. Si el usuario no puede crear un producto, NUNCA hagas preguntas de diagnóstico; primero usa la herramienta `check_form_status` de forma invisible y dile verbalmente qué campos se acaban de iluminar en rojo en su pantalla."
