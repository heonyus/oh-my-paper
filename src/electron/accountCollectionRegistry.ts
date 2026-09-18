import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import {
  type AccountId,
  accountIdSchema,
  type CollectionSwitchChoice,
} from "../shared/accountSchemas"
import {
  activeCollectionPointerSchema,
  type CollectionId,
  collectionIdSchema,
} from "../shared/collectionSchemas"
import { initializeCollection } from "./collectionFiles"
import { replaceDurably } from "./collectionJournal"
import { collectionIndexFile, collectionRootForId } from "./collectionPaths"

export type AccountCollectionStore = {
  readonly collectionService: {
    readonly files: { readonly manifest: { readonly collectionId: CollectionId } }
  } | null
}

const bindingSchema = z
  .object({ collectionId: collectionIdSchema, accountId: accountIdSchema })
  .strict()
const registrySchema = z
  .object({
    version: z.literal(1),
    bindings: z.array(bindingSchema).max(256),
    preferred: z.array(bindingSchema).max(256),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.bindings.map((item) => item.collectionId)).size !== value.bindings.length) {
      context.addIssue({ code: "custom", message: "Duplicate collection ownership" })
    }
    if (new Set(value.preferred.map((item) => item.accountId)).size !== value.preferred.length) {
      context.addIssue({ code: "custom", message: "Duplicate preferred account collection" })
    }
    for (const preferred of value.preferred) {
      if (
        !value.bindings.some(
          (binding) =>
            binding.collectionId === preferred.collectionId &&
            binding.accountId === preferred.accountId,
        )
      ) {
        context.addIssue({ code: "custom", message: "Preferred collection is not owned" })
      }
    }
  })

type Registry = z.infer<typeof registrySchema>

export class AccountCollectionRegistryError extends Error {
  readonly name = "AccountCollectionRegistryError"
  constructor(readonly kind: "collection_unavailable" | "owner_conflict" | "rollback_failed") {
    super(kind)
  }
}

export class AccountCollectionRegistry {
  readonly #registryFile: string
  readonly #activePointer: string
  #queue: Promise<void> = Promise.resolve()

  constructor(
    readonly userDataRoot: string,
    private readonly getStore: () => AccountCollectionStore | null,
    private readonly switchStore: (
      collectionRoot: string,
      indexFile: string,
      accountId: AccountId,
    ) => Promise<void>,
  ) {
    this.#registryFile = join(userDataRoot, "account", "collection-owners.json")
    this.#activePointer = join(userDataRoot, "active-collection.json")
  }

  async currentAccountId(): Promise<AccountId | null> {
    const collectionId = currentCollectionId(this.getStore())
    if (!collectionId) return null
    return (
      (await this.read()).bindings.find((item) => item.collectionId === collectionId)?.accountId ??
      null
    )
  }

  bindUnownedToAccount(accountId: AccountId): Promise<void> {
    return this.exclusive(async () => {
      const collectionId = currentCollectionId(this.getStore())
      if (!collectionId) throw new AccountCollectionRegistryError("collection_unavailable")
      const registry = await this.read()
      const owner = registry.bindings.find((item) => item.collectionId === collectionId)
      if (owner && owner.accountId !== accountId) {
        throw new AccountCollectionRegistryError("owner_conflict")
      }
      if (owner) return
      await this.write(prefer(registry, { collectionId, accountId }))
    })
  }

  openForAccount(
    accountId: AccountId,
    choice: Exclude<CollectionSwitchChoice, "cancel">,
  ): Promise<void> {
    return this.exclusive(async () => {
      const before = await this.read()
      const currentId = currentCollectionId(this.getStore())
      if (!currentId) throw new AccountCollectionRegistryError("collection_unavailable")
      const targetId =
        choice === "create_separate_collection"
          ? collectionIdSchema.parse(randomUUID())
          : before.preferred.find((item) => item.accountId === accountId)?.collectionId
      if (!targetId) throw new AccountCollectionRegistryError("collection_unavailable")
      if (choice === "create_separate_collection") {
        await initializeCollection(collectionRootForId(this.userDataRoot, targetId), targetId)
      }
      const next = prefer(before, { collectionId: targetId, accountId })
      await this.write(next)
      await this.switchWithRollback(currentId, targetId, accountId, before)
    })
  }

  dispose(): Promise<void> {
    return this.#queue
  }

  private exclusive(operation: () => Promise<void>): Promise<void> {
    const result = this.#queue.catch(() => undefined).then(operation)
    this.#queue = result.catch(() => undefined)
    return result
  }

  private async switchWithRollback(
    currentId: string,
    targetId: string,
    targetOwner: AccountId,
    before: Registry,
  ) {
    const currentOwner = ownerOf(before, currentId)
    try {
      await this.switchStore(
        collectionRootForId(this.userDataRoot, targetId),
        collectionIndexFile(this.userDataRoot, targetId),
        targetOwner,
      )
      await replaceDurably(
        this.#activePointer,
        Buffer.from(
          `${JSON.stringify(activeCollectionPointerSchema.parse({ schemaVersion: 1, collectionId: targetId }))}\n`,
        ),
      )
    } catch (error) {
      try {
        await this.write(before)
        await this.switchStore(
          collectionRootForId(this.userDataRoot, currentId),
          collectionIndexFile(this.userDataRoot, currentId),
          currentOwner,
        )
      } catch {
        throw new AccountCollectionRegistryError("rollback_failed")
      }
      throw error
    }
  }

  private async read(): Promise<Registry> {
    try {
      return registrySchema.parse(JSON.parse(await readFile(this.#registryFile, "utf8")))
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return { version: 1, bindings: [], preferred: [] }
      }
      throw error
    }
  }

  private write(registry: Registry): Promise<void> {
    return replaceDurably(
      this.#registryFile,
      Buffer.from(`${JSON.stringify(registrySchema.parse(registry), null, 2)}\n`),
    )
  }
}

function ownerOf(registry: Registry, collectionId: string): AccountId {
  const owner = registry.bindings.find((item) => item.collectionId === collectionId)?.accountId
  if (!owner) throw new AccountCollectionRegistryError("collection_unavailable")
  return owner
}

function currentCollectionId(store: AccountCollectionStore | null) {
  return store?.collectionService?.files.manifest.collectionId ?? null
}

function prefer(registry: Registry, binding: Registry["bindings"][number]) {
  const owner = registry.bindings.find((item) => item.collectionId === binding.collectionId)
  if (owner && owner.accountId !== binding.accountId) {
    throw new AccountCollectionRegistryError("owner_conflict")
  }
  const bindings = owner ? registry.bindings : [...registry.bindings, binding]
  const preferred = [
    binding,
    ...registry.preferred.filter((item) => item.accountId !== binding.accountId),
  ]
  return registrySchema.parse({ version: 1, bindings, preferred })
}
