<script lang="ts">
// The sign-in form, with no script: a handle, then the member's own server asks for their password.
import { Button } from "#lib/components/ui/button/index.js";
import * as Card from "#lib/components/ui/card/index.js";
import * as Field from "#lib/components/ui/field/index.js";
import { Input } from "#lib/components/ui/input/index.js";

let { data } = $props();
</script>

<svelte:head><title>Sign in · Unset</title></svelte:head>

<main class="mx-auto flex min-h-svh w-full max-w-md items-center px-4">
  <Card.Root class="w-full" role="region" aria-labelledby="sign-in-title">
    <Card.Header>
      <Card.Title><h1 id="sign-in-title">Sign in</h1></Card.Title>
      <Card.Description>
        Use your AT Protocol handle. You type your password on your own account's server, never here.
      </Card.Description>
    </Card.Header>
    <form method="POST">
      <Card.Content>
        <Field.Field data-invalid={data.error !== null ? true : undefined}>
          <Field.Label for="handle">Handle</Field.Label>
          <Input
            id="handle"
            name="handle"
            type="text"
            inputmode="url"
            autocomplete="username"
            autocapitalize="none"
            spellcheck={false}
            placeholder="you.bsky.social"
            maxlength={254}
            required
            aria-invalid={data.error !== null ? true : undefined}
            aria-describedby={data.error !== null ? "sign-in-error" : undefined}
          />
          {#if data.error !== null}
            <Field.Error id="sign-in-error">{data.error}</Field.Error>
          {/if}
        </Field.Field>
      </Card.Content>
      <Card.Footer class="mt-6">
        <Button type="submit">Sign in</Button>
      </Card.Footer>
    </form>
  </Card.Root>
</main>
