import { employeeModules, normalizePermissions } from '../config/permissions';

interface Props {
  value: string[];
  onChange: (permissions: string[]) => void;
}

export default function EmployeePermissions({ value, onChange }: Props) {
  const selected = new Set(value);
  const toggle = (module: string, action: string, checked: boolean) => {
    const next = new Set(value);
    const permission = `${module}.${action}`;
    if (checked) {
      next.add(permission);
      next.add(`${module}.view`);
    } else if (action === 'view') {
      for (const item of next) if (item.startsWith(`${module}.`)) next.delete(item);
    } else next.delete(permission);
    onChange(normalizePermissions([...next]));
  };
  return (
    <fieldset className="space-y-3 rounded-xl border border-green-200 bg-green-50/40 p-4">
      <legend className="px-1 text-sm font-semibold text-gray-900">Permisos del empleado</legend>
      <p className="text-xs leading-5 text-gray-600">Marcá los módulos y las acciones que podrá utilizar. Sin permisos marcados, no tendrá acceso a módulos. Usuarios y permisos queda reservado al administrador.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {employeeModules.map(module => (
          <div key={module.id} className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="mb-2 text-sm font-semibold text-gray-900">{module.label}</p>
            <div className="space-y-2">
              {module.actions.map(([action, label]) => (
                <label key={action} className="flex cursor-pointer items-start gap-2 text-sm text-gray-700">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-green-600"
                    checked={selected.has(`${module.id}.${action}`)}
                    onChange={event => toggle(module.id, action, event.target.checked)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500">Al habilitar una acción también se habilita la consulta de ese módulo. Los datos de referencia necesarios para completar una operación se habilitan junto con ella.</p>
    </fieldset>
  );
}
