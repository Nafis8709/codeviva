package com.reliefsync.pattern.chain;

import com.reliefsync.model.verification.VerificationTier;

public final class VerificationChainBuilder {
  public VerificationHandler build(VerificationTier tier) {
    VerificationHandler volunteer = new VolunteerVerificationHandler();
    VerificationHandler area = new AreaCoordinatorVerificationHandler();
    volunteer.setNext(area);
    if (tier == VerificationTier.HIGH || tier == VerificationTier.CRITICAL) {
      VerificationHandler relief = new ReliefCoordinatorVerificationHandler();
      area.setNext(relief);
      if (tier == VerificationTier.CRITICAL) relief.setNext(new AdministratorVerificationHandler());
    }
    return volunteer;
  }
}
