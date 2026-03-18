const DEPARTMENT_CONFIG = {
  Fiscal: {
    responsibleField: "respFiscalId",
    responsibleAlias: "respFiscal",
    sentToClient: "sentToClientFiscal",
    declarationsCompleted: "declarationsCompletedFiscal",
    isZeroed: "isZeroedFiscal",
    hasNoObligations: "hasNoFiscalObligations",
    completedAt: "fiscalCompletedAt",
    bonusField: "bonusValue",
    zeroedBonusDefault: 1,
  },
  Pessoal: {
    responsibleField: "respDpId",
    responsibleAlias: "respDp",
    sentToClient: "sentToClientDp",
    declarationsCompleted: "declarationsCompletedDp",
    isZeroed: "isZeroedDp",
    hasNoObligations: "hasNoDpObligations",
    completedAt: "dpCompletedAt",
    bonusField: "employeesCount",
    zeroedBonusDefault: 0,
  },
  Contábil: {
    responsibleField: "respContabilId",
    responsibleAlias: "respContabil",
    bonusField: "accountingMonthsCount",
  },
};

function getDeptConfig(departmentName) {
  return DEPARTMENT_CONFIG[departmentName] || null;
}

function getAllDeptConfigs() {
  return DEPARTMENT_CONFIG;
}

module.exports = { DEPARTMENT_CONFIG, getDeptConfig, getAllDeptConfigs };
