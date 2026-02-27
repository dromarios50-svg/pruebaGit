1. Configuración Inicial (Una sola vez)
    git config --global user.name "Tu Nombre"
    git config --global user.email "tu@correo.com"
------------------------------------------------
2. Creación y Primer Envío del Repositorio
    git init: Crea un repositorio vacío en tu carpeta local.
    git add .: Agrega todos tus archivos al área de preparación (staging).
    git commit -m "mensaje": Guarda una "foto" de tus archivos con una descripción.
    git branch -M main: Asegura que tu rama principal se llame main.
    git remote add origin [URL-del-repo]: Conecta tu computadora con el servidor remoto (GitHub/GitLab).
    git push -u origin main: Sube tus archivos por primera vez.
-------------------------------------------------------------
3. Flujo de Trabajo Diario (Subir cambios nuevos)
    git status: (Opcional) Para ver qué archivos has modificado.
    git add .: Preparas los cambios para el guardado.
    git commit -m "mensaje referencial": Guardas los cambios localmente.
    git push: Envías esos cambios a la nube.
------------------------------------------------------
4. Obtener Repositorios Existentes
    git clone -------> (link de repositorio a clonar)
    git pull  (sincroniza con repositorio de GitHub)
-------------------------------------------------------