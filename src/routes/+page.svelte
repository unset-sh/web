<script lang="ts">
import { Button } from "#lib/components/ui/button/index.js";
import * as Card from "#lib/components/ui/card/index.js";
</script>

<svelte:head>
  <title>Unset</title>
</svelte:head>

<main class="mx-auto flex min-h-svh w-full max-w-md items-center px-4">
  <Card.Root class="w-full">
    <Card.Header>
      <Card.Title><h1>Unset</h1></Card.Title>
      <Card.Description>Your profile on the AT Protocol network.</Card.Description>
    </Card.Header>
    <!-- The page reads no cookie, so it links both: sign-in sends a member who is signed in on to their profile. -->
    <Card.Footer class="gap-2">
      <Button href="/login">Sign in</Button>
      <Button href="/profile" variant="outline">Your profile</Button>
    </Card.Footer>
  </Card.Root>
</main>
