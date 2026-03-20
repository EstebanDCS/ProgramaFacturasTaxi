from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.facturas import router as facturas_router
from routes.user import router as user_router
from routes.plantillas import router as plantillas_router
from routes.admin import router as admin_router

app = FastAPI(title="Gestión Facturas v2")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(facturas_router)
app.include_router(user_router)
app.include_router(plantillas_router)
app.include_router(admin_router)
