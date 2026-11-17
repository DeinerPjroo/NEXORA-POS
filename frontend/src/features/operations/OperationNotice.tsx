export function OperationNotice({ uncertain }: { uncertain: boolean }) {
  return uncertain ? (
    <div className="notice operation-uncertain" role="status">
      No pudimos confirmar si el servidor guardó la operación. Mantén este formulario abierto y
      reintenta el mismo envío para verificarlo sin duplicarlo.
    </div>
  ) : null
}
