import type { CompanyView, ProductView } from '@muchomoney/core';
import { SECTORS } from '@muchomoney/core';
import { sendAction } from '../../api';
import { AmountForm } from '../../components/AmountForm';
import { Modal } from '../../components/Modal';
import { useT, useUiLang } from '../../i18n';
import { industryMessages } from '../../i18n/industry';
import { Rich } from '../../i18n/Rich';
import { useFmt } from '../../fmt';

/** Agrandir la capacité d'un produit (§5.3), depuis la fiche produit ou la vue « Mes usines ». */
export function ExpandCapacityModal({ company, product, onClose }: { company: CompanyView; product: ProductView; onClose: () => void }) {
  const t = useT();
  const fmt = useFmt();
  const isCrypto = product.sectorId === 'crypto';
  const expandCost = SECTORS[product.sectorId]?.capacityCost ?? 0;
  const pending = product.private?.pendingCapacity ?? 0;
  const text = industryMessages(useUiLang());
  return (
    <Modal title={(isCrypto ? t.product.expandServersTitle : t.product.expandTitle)(product.name)} onClose={onClose}>
      <p className="small muted">{(isCrypto ? t.product.expandServersBody : t.product.expandBody)(fmt.money(expandCost))}</p>
      {product.capacityLimit !== undefined && <p className="small muted">{text.cap(fmt.lots(product.capacityLimit))}</p>}
      <AmountForm
        label={isCrypto ? t.product.expandServersLabel : t.product.expandLabel}
        unit="lots"
        max={Math.min(expandCost > 0 ? Math.floor(Math.max(0, company.cash) / expandCost) : 0,
          product.capacityLimit === undefined ? Infinity : Math.max(0, product.capacityLimit - product.capacity - pending))}
        submitLabel={isCrypto ? t.product.installServers : t.product.build}
        info={(n) => <Rich text={t.product.expandInfo(fmt.money(n * expandCost), fmt.lots(product.capacity + pending + n))} />}
        after={(n) => t.form.cashAfter(fmt.money(company.cash - n * expandCost))}
        onSubmit={async (lots) => {
          const r = await sendAction({ type: 'expandCapacity', companyId: company.id, productId: product.id, lots });
          if (r.ok) onClose();
          return r;
        }}
      />
    </Modal>
  );
}
