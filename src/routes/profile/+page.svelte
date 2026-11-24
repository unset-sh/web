<script lang="ts">
// The member's profile, with no script: who they are, and one field to change their display name.
import { Button } from "#lib/components/ui/button/index.js";
import * as Card from "#lib/components/ui/card/index.js";
import * as Field from "#lib/components/ui/field/index.js";
import { Input } from "#lib/components/ui/input/index.js";
import { Separator } from "#lib/components/ui/separator/index.js";

let { data, form } = $props();
const error = $derived(form?.error ?? data.error);
</script>

<svelte:head><title>Your profile · Unset</title></svelte:head>

<main class="mx-auto flex min-h-svh w-full max-w-md items-center px-4">
  <Card.Root class="w-full" role="region" aria-labelledby="profile-title">
    <Card.Header>
      <Card.Title><h1 id="profile-title">{data.profile?.displayName ?? "Your profile"}</h1></Card.Title>
      {#if data.profile !== null}
        <Card.Description>
          {#if data.profile.handle !== undefined}@{data.profile.handle}{:else}Your handle could not be confirmed.{/if}
        </Card.Description>
      {/if}
    </Card.Header>
    <Card.Content>
      {#if data.profile !== null}
        <p class="break-all text-sm">{data.profile.did}</p>
        <Separator class="my-6" />
        <form method="POST" id="profile-form">
          <Field.Field data-invalid={error !== null ? true : undefined}>
            <Field.Label for="displayName">Display name</Field.Label>
            <Input
              id="displayName"
              name="displayName"
              type="text"
              value={data.profile.displayName ?? ""}
              maxlength={640}
              autocomplete="nickname"
              aria-invalid={error !== null ? true : undefined}
              aria-describedby={error !== null ? "profile-error" : "profile-hint"}
            />
            <Field.Description id="profile-hint">Leave it empty to remove it.</Field.Description>
            {#if error !== null}<Field.Error id="profile-error">{error}</Field.Error>{/if}
            {#if form?.saved}<p role="status">Saved.</p>{/if}
          </Field.Field>
        </form>
      {:else if error !== null}
        <p role="alert">{error}</p>
      {/if}
    </Card.Content>
    <Card.Footer class="flex justify-between gap-2">
      {#if data.profile !== null}<Button type="submit" form="profile-form">Save</Button>{/if}
      <form method="POST" action="/logout"><Button type="submit" variant="outline">Sign out</Button></form>
    </Card.Footer>
  </Card.Root>
</main>
