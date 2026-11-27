<script lang="ts">
import markLight from "@unset-sh/brand/logo/unset-mark-onyx.svg";
import markDark from "@unset-sh/brand/logo/unset-mark-platinum.svg";
import { onMount } from "svelte";
import { Button } from "#lib/components/ui/button/index.js";
import * as Card from "#lib/components/ui/card/index.js";
import "./homepage.css";

const themes = ["system", "light", "dark"] as const;
type Theme = (typeof themes)[number];
let theme = $state<Theme>("system");
let interactive = $state(false);

function setTheme(value: Theme) {
  theme = value;
  if (value === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = value;
}

onMount(() => {
  const current = document.documentElement.dataset.theme;
  if (current === "light" || current === "dark") theme = current;
  interactive = true;
});
</script>

{#snippet mark()}
  <img class="mark-dark" src={markDark} width="828" height="220" alt="">
  <img class="mark-light" src={markLight} width="828" height="220" alt="">
{/snippet}

  <a class="skip-link" href="#main">Skip to content</a>
  <div class="homepage" id="top">
    <header class="site-header wrap">
      <a class="brand" href="#top" aria-label="unset home">
        <span class="brand-mark">{@render mark()}</span>
        <span>unset.sh</span>
      </a>
      <nav aria-label="Main navigation">
        <a class="about-link" href="#about">About unset</a>
        <div class="theme-controls" role="group" aria-label="Appearance">
          {#each themes as choice}
            <Button
              variant={theme === choice ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={theme === choice}
              disabled={!interactive}
              onclick={() => setTheme(choice)}
            >{choice[0]?.toUpperCase()}{choice.slice(1)}</Button>
          {/each}
        </div>
      </nav>
    </header>

    <main id="main" tabindex="-1">
      <section class="hero wrap" aria-labelledby="hero-title">
        <div class="hero-copy">
          <p class="eyebrow">A profile. An identity. Yours.</p>
          <h1 id="hero-title"><span>Your corner</span><span>of the internet.</span></h1>
          <p class="hero-description">A home for your introduction, projects and links.<br class="desktop-break"> We’re building profiles that feel like you.</p>
          <div class="identity-line"><span class="identity-rule" aria-hidden="true"></span><span>Built on the AT Protocol.<br>{' '}Your profile records live in your own account.</span></div>
        </div>

        <Card.Root class="welcome" aria-labelledby="welcome-title">
          <Card.Content class="welcome-main">
            <span class="welcome-mark">{@render mark()}</span>
            <Card.Title class="welcome-title"><h2 id="welcome-title">Make yourself at home.</h2></Card.Title>
            <Card.Description>Your own space starts here.</Card.Description>
            <Button class="signin-button" href="/login" size="lg">Sign in to unset</Button>
            <Button class="visitor-button" variant="outline" size="lg" href="#about" aria-describedby="visitor-note">Continue as a visitor</Button>
            <p class="visitor-note" id="visitor-note">Learn about unset. No account needed.</p>
            <div class="invite-note"><span>Already on AT Protocol?</span><p>Sign in with your existing handle.<br>{' '}Your account’s server handles your password.</p></div>
          </Card.Content>
          <Card.Footer class="development-note"><span class="development-label">In development</span><p>We’re building unset, one piece at a time.</p></Card.Footer>
        </Card.Root>
      </section>

      <section class="principles wrap" aria-label="What makes unset different">
        <div><h2>Make it yours.</h2><p>A space for your words, projects and links.<br>{' '}That’s the direction we’re building toward.</p></div>
        <div><h2>An identity you own.</h2><p>Your profile lives in your AT Protocol<br>{' '}repository, ready to move with you.</p></div>
        <div><h2>Built on open foundations.</h2><p>Sign in with your AT Protocol handle.<br>{' '}Your identity starts with your account.</p></div>
      </section>

      <section class="about-section" id="about" aria-labelledby="about-title">
        <div class="about-content wrap">
          <div class="about-copy">
            <p class="eyebrow">More than a name and a bio</p>
            <h2 id="about-title">One page.<br>{' '}A fuller picture.</h2>
            <p>A place for what you make, what you care about, and where to find you. We’re starting with your identity, then building the pieces that make it yours.</p>
            <ul class="capabilities"><li>A proper introduction</li><li>Projects and collections</li><li>Your favourite links</li></ul>
          </div>
          <div class="example-area">
            <div class="example-caption"><span>An example of your space</span><span>Profile preview</span></div>
            <Card.Root class="profile-example" aria-label="Illustrative profile for Jordan Lee">
              <div class="profile-top"><div class="avatar" aria-hidden="true">JL</div><div><h3>Jordan Lee</h3><p class="handle">@jordan.example</p></div><span class="profile-brand">unset</span></div>
              <p class="profile-headline">Designer, weekend gardener,<br>{' '}and collector of good ideas.</p>
              <div class="readme"><span class="small-label">A little about me</span><p>I make things for the web and grow things on my balcony. Usually with a coffee nearby.</p></div>
              <div class="profile-links"><div><span class="link-initial" aria-hidden="true">W</span><span>Selected work<small>A few things I’ve made</small></span><span class="link-domain">work.example</span></div><div><span class="link-initial" aria-hidden="true">N</span><span>Field notes<small>Ideas, experiments, and other things</small></span><span class="link-domain">notes.example</span></div></div>
            </Card.Root>
            <p class="example-disclaimer">Illustrative profile. Custom sections are in development.</p>
          </div>
        </div>
      </section>
    </main>

    <footer class="site-footer wrap">
      <div><a class="footer-brand" href="#top">unset.sh</a><p>Your corner of the internet.</p></div>
      <nav aria-label="More about unset"><a href="#about">About unset</a><a href="https://github.com/unset-sh/web">Source code</a></nav>
      <span class="protocol-credit">Built on AT Protocol</span>
    </footer>
  </div>
