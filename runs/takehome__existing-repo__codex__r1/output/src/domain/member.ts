import { validation } from "../errors.ts";
import { ok, err, type Result } from "../result.ts";

export interface Member {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly createdAt: Date;
}

// The only shape of a member that may appear outside /members/:id.
// See CONTRIBUTING.md, "Member data".
export interface MemberSummary {
  readonly id: string;
  readonly name: string;
}

export interface NewMember {
  readonly name: string;
  readonly email: string;
}

const NAME_MAX = 80;
// Deliberately loose: the address is confirmed by email, not by regex.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateNewMember(input: NewMember): Result<NewMember> {
  const name = input.name.trim();
  if (name.length === 0) return err(validation("name", "name is required"));
  if (name.length > NAME_MAX) {
    return err(validation("name", `name must be at most ${NAME_MAX} characters`));
  }
  const email = normaliseEmail(input.email);
  if (!EMAIL_SHAPE.test(email)) return err(validation("email", "email is not a valid address"));
  return ok({ name, email });
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function toSummary(member: Member): MemberSummary {
  return { id: member.id, name: member.name };
}
