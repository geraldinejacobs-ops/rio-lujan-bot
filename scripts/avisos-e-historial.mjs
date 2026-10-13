jobs:
  actualizar:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Leer avisos del SMN y guardar historial
        run: node scripts/avisos-e-historial.mjs

      - name: Guardar cambios
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add data/alertas-smn.json data/historial-rio-lujan.csv
          if git diff --cached --quiet; then
            echo "Sin cambios"
            exit 0
          fi
          git commit -m "Actualizar avisos SMN e historial del río"
          for i in 1 2 3; do
            git pull --rebase origin main && git push && exit 0
            sleep 5
          done
          exit 1
