# Robot — Nivel del río Luján en Mercedes

Este robot entra cada 15 minutos a la Red Hidrométrica de la UNLu, trae el
último nivel del río Luján en Mercedes, y lo guarda en
`data/rio-lujan-mercedes.json`.

Como corre en los servidores de GitHub (no en un navegador), no choca con
la restricción de CORS que bloqueaba este dato cuando lo pedía SPC Clima
directamente.

## Cómo lo usa la app

Una vez que este repositorio esté creado y el robot corrió al menos una
vez, el archivo queda disponible en una URL pública así:

```
https://raw.githubusercontent.com/TU-USUARIO/TU-REPOSITORIO/main/data/rio-lujan-mercedes.json
```

Esa URL es la que hay que pegar en el código de SPC Clima (ya viene
preparado con un lugar marcado para eso).

## Probarlo manualmente

Sin esperar los 15 minutos: en la pestaña "Actions" del repositorio en
GitHub, entrá al workflow "Actualizar nivel río Luján (Mercedes)" y tocá
"Run workflow".
