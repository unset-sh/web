<script lang="ts">
// After signing out. Only this browser was signed out; the account's own server keeps its session.
import { Button } from "#lib/components/ui/button/index.js";
import * as Card from "#lib/components/ui/card/index.js";
</script>

<svelte:head><title>Signed out · Unset</title></svelte:head>

<main class="mx-auto flex min-h-svh w-full max-w-md items-center px-4">
  <Card.Root class="w-full" role="region" aria-labelledby="signed-out-title">
    <Card.Header>
      <Card.Title><h1 id="signed-out-title">You are signed out of Unset</h1></Card.Title>
      <Card.Description>
        This browser only. Your account's own server may still have you signed in: sign out there too if this is a
        shared computer.
      </Card.Description>
    </Card.Header>
    <Card.Footer><Button href="/login" variant="outline">Sign in again</Button></Card.Footer>
  </Card.Root>
</main>
