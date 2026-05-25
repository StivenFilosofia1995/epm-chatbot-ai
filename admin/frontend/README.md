# UVA Admin Frontend

Panel administrativo para operación diaria del bot:
- Login de administrador
- Logs en tiempo real
- Reset de sesiones
- Gestión de programación

## Ejecución local
```bash
cd admin/frontend
npm install
npm run dev
```

## Variables
Copie `.env.example` a `.env` y ajuste:
- `VITE_API_BASE` (por defecto `http://localhost:8000/api`)
