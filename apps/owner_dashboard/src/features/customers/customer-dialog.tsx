'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from '@/hooks/use-toast';
import { getApiErrorMessage } from '@/lib/api-error';
import { useCreateCustomer, useUpdateCustomer } from './use-customers';
import type { CustomerItem, CreateCustomerInput, UpdateCustomerInput } from './customer-api';
import { Briefcase } from 'lucide-react';

type CustomerType = 'PERSONA' | 'EMPRESA';

const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  PERSONA: 'Persona Natural',
  EMPRESA: 'Empresa / Jurídica',
};

const CUSTOMER_TYPES: CustomerType[] = ['PERSONA', 'EMPRESA'];

interface CustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerToEdit?: CustomerItem | null;
}

interface CustomerFormProps {
  customerToEdit?: CustomerItem | null;
  onClose: () => void;
}

function CustomerForm({ customerToEdit, onClose }: CustomerFormProps) {
  const isEdit = Boolean(customerToEdit);
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();

  const [name, setName] = useState(customerToEdit?.name ?? '');
  const [taxId, setTaxId] = useState(customerToEdit?.tax_id ?? '');
  const [phone, setPhone] = useState(customerToEdit?.phone ?? '');
  const [email, setEmail] = useState(customerToEdit?.email ?? '');
  const [address, setAddress] = useState(customerToEdit?.address ?? '');
  const [customerType, setCustomerType] = useState<CustomerType>(
    (customerToEdit?.customer_type as CustomerType) ?? 'PERSONA',
  );
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('El nombre del cliente es obligatorio.');
      return;
    }

    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('El correo electrónico no tiene un formato válido.');
      return;
    }

    const payload: CreateCustomerInput = {
      name: trimmedName,
      customer_type: customerType,
      ...(taxId.trim() ? { tax_id: taxId.trim() } : {}),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      ...(email.trim() ? { email: email.trim() } : {}),
      ...(address.trim() ? { address: address.trim() } : {}),
    };

    try {
      if (isEdit && customerToEdit) {
        const updatePayload: UpdateCustomerInput = {
          name: trimmedName,
          customer_type: customerType,
          tax_id: taxId.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          address: address.trim() || undefined,
        };
        await updateCustomer.mutateAsync({ id: customerToEdit.id, dto: updatePayload });
        toast({
          variant: 'success',
          title: 'Cliente actualizado',
          description: `Los datos de "${trimmedName}" fueron actualizados exitosamente.`,
        });
      } else {
        await createCustomer.mutateAsync(payload);
        toast({
          variant: 'success',
          title: 'Cliente registrado',
          description: `"${trimmedName}" fue registrado exitosamente en el directorio.`,
        });
      }
      onClose();
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Ocurrió un error inesperado al guardar el cliente.');
      setError(msg);
      toast({
        variant: 'destructive',
        title: 'Error al guardar cliente',
        description: msg,
      });
    }
  };

  const isPending = createCustomer.isPending || updateCustomer.isPending;

  return (
    <form onSubmit={handleSubmit} noValidate>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? 'Actualizá la información del cliente en el directorio.'
            : 'Registrá un nuevo cliente para ventas, facturación y convenios comerciales.'}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="customer-name">
            Nombre / Razón Social <span className="text-destructive">*</span>
          </Label>
          <Input
            id="customer-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Distribuidora San José S.A. o María López"
            required
            disabled={isPending}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="customer-type">Tipo de Cliente</Label>
          <select
            id="customer-type"
            value={customerType}
            onChange={(e) => setCustomerType(e.target.value as CustomerType)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isPending}
          >
            {CUSTOMER_TYPES.map((t) => (
              <option key={t} value={t}>
                {CUSTOMER_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          {customerType === 'EMPRESA' && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1 text-primary">
              <Briefcase className="h-3.5 w-3.5 shrink-0" />
              <span>Las empresas pueden vincularse a Convenios Comerciales corporativos.</span>
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="customer-tax-id">RUC / Cédula</Label>
          <Input
            id="customer-tax-id"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
            placeholder="Ej: J0310000000123 o 001-120590-0001A"
            disabled={isPending}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="customer-phone">Teléfono</Label>
            <Input
              id="customer-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ej: 2222-3333 o 8888-1234"
              disabled={isPending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="customer-email">Correo Electrónico</Label>
            <Input
              id="customer-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cliente@empresa.com.ni"
              disabled={isPending}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="customer-address">Dirección</Label>
          <Input
            id="customer-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Ej: Km 5 Carretera Norte, Managua"
            disabled={isPending}
          />
        </div>
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Guardando...' : isEdit ? 'Guardar Cambios' : 'Registrar Cliente'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CustomerDialog({ open, onOpenChange, customerToEdit }: CustomerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && (
          <CustomerForm
            key={customerToEdit?.id ?? 'new-customer'}
            customerToEdit={customerToEdit}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
