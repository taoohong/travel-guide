import { VisaRequirementType, VisaType } from '@travel-guide/constants';
import type { VisaPolicy } from '@travel-guide/types';

export const visaRequirementLabel = (policy: VisaPolicy) => {
  const labels: Record<string, string> = {
    [VisaRequirementType.REQUIRED]: '需要提前办理',
    [VisaRequirementType.VISA_FREE]: '符合条件可免签',
    [VisaRequirementType.VISA_ON_ARRIVAL]: '可按规定办理落地签',
    [VisaRequirementType.E_VISA]: '可按规定申请电子签',
    [VisaRequirementType.CONDITIONAL]: '需核对适用条件',
    [VisaRequirementType.UNKNOWN]: '',
  };
  return labels[policy.visaRequirement] || (policy.visaType === VisaType.VISA_REQUIRED ? '需要提前办理' :
    policy.visaType === VisaType.VISA_FREE ? '符合条件可免签' : '请以官方规定为准');
};

export const visaStayLabel = (days: number | null) => days !== null && days > 0 ? `${days} 天` : '未明确';

export function passportRequirementLabel(policy: Pick<VisaPolicy,
  'passportRequired' | 'passportValidityMonths' | 'passportValidityRequirement'>): string {
  if (policy.passportValidityRequirement?.trim()) return policy.passportValidityRequirement.trim();
  if (policy.passportValidityMonths && policy.passportValidityMonths > 0) return `护照需至少有效 ${policy.passportValidityMonths} 个月`;
  if (policy.passportRequired === true) return '需要有效护照';
  if (policy.passportRequired === false) return '无额外护照要求';
  return '请查看详细规定';
}
