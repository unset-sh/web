<script lang="ts">
// Between the sign-in form and the account's server: a meta refresh, outside the form's redirect chain that
// `form-action 'self'` covers, and a link for a browser that does not follow it. No script.
import { Button } from "#lib/components/ui/button/index.js";
import * as Card from "#lib/components/ui/card/index.js";

let { data } = $props();
</script>

<svelte:head>
  <title>Continue signing in · Unset</title>
  <meta http-equiv="refresh" content={`0;url=${data.target}`} />
</svelte:head>

<main class="mx-auto flex min-h-svh w-full max-w-md items-center px-4">
  <Card.Root class="w-full">
    <Card.Header>
      <Card.Title><h1>You are going to <strong>{data.host}</strong></h1></Card.Title>
      <Card.Description>Your account's server asks for your password, then sends you back here.</Card.Description>
    </Card.Header>
    <Card.Footer><Button href={data.target}>Continue to {data.host}</Button></Card.Footer>
  </Card.Root>
</main>
