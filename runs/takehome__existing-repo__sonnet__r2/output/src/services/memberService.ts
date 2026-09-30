import { validateNewMember, type Member, type NewMember } from "../domain/member.ts";
import { conflict, notFound } from "../errors.ts";
import { andThen, err, ok, type Result } from "../result.ts";
import type { ServiceDeps } from "./deps.ts";

export interface MemberService {
  register(input: NewMember): Result<Member>;
  get(id: string): Result<Member>;
}

export function createMemberService({ repos, clock, ids }: ServiceDeps): MemberService {
  return {
    register(input) {
      return andThen(validateNewMember(input), (valid) => {
        if (repos.members.findByEmail(valid.email)) {
          return err(conflict("email_taken", "a member with this email already exists"));
        }
        const member: Member = { id: ids("mem"), ...valid, createdAt: clock.now() };
        repos.members.insert(member);
        return ok(member);
      });
    },

    get(id) {
      const member = repos.members.findById(id);
      return member ? ok(member) : err(notFound("member", id));
    },
  };
}
