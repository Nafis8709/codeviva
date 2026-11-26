package com.reliefsync.pattern.chain;

import com.reliefsync.exception.AuthorizationException;
import com.reliefsync.exception.ValidationException;
import com.reliefsync.model.enums.Role;
import com.reliefsync.model.enums.VerificationDecision;
import com.reliefsync.model.verification.*;

public abstract class VerificationHandler {
  private VerificationHandler next;
  private final VerificationLevel level;
  private final Role role;

  protected VerificationHandler(VerificationLevel level, Role role) {
    this.level = level;
    this.role = role;
  }

  public VerificationHandler setNext(VerificationHandler value) {
    next = value;
    return value;
  }

  public VerificationLevel level() {
    return level;
  }

  public VerificationLevel nextRequired(VerificationContext context) {
    if (context.approvedLevels().contains(level))
      return next == null ? null : next.nextRequired(context);
    return level;
  }

  public VerificationResult handle(VerificationContext context) {
    if (context.approvedLevels().contains(level)) {
      if (next == null)
        return new VerificationResult(VerificationOutcome.VERIFIED, null, null, true);
      return next.handle(context);
    }
    if (context.session().role() != role)
      throw new AuthorizationException("The next required verifier is " + level + ".");
    VerificationDecision decision = context.decision();
    if (decision == null) throw new ValidationException("Verification decision is required.");
    if ((decision == VerificationDecision.RETURNED || decision == VerificationDecision.REJECTED)
        && (context.reason() == null || context.reason().isBlank()))
      throw new ValidationException("A reason is required when returning or rejecting a request.");
    if (decision == VerificationDecision.RETURNED)
      return new VerificationResult(VerificationOutcome.RETURNED, level, null, false);
    if (decision == VerificationDecision.REJECTED)
      return new VerificationResult(VerificationOutcome.REJECTED, level, null, false);
    VerificationLevel nextLevel = next == null ? null : next.nextRequired(context);
    return new VerificationResult(
        nextLevel == null ? VerificationOutcome.VERIFIED : VerificationOutcome.STEP_APPROVED,
        level,
        nextLevel,
        nextLevel == null);
  }
}
