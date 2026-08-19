# Hetzner deployment user

Production deployments use a dedicated SSH account instead of a personal administrator account.

Recommended account name: `blog-deploy`.

## 1. Create an SSH key for GitHub Actions

Create a dedicated key pair on a trusted workstation. Do not reuse a personal SSH key.

```bash
ssh-keygen -t ed25519 -f ./blog-deploy -C "github-actions-blog-deploy"
```

Store the private key content as the GitHub secret `HETZNER_SSH_KEY`.

## 2. Bootstrap the account on Hetzner

Copy the public key and run as root on the server:

```bash
sudo DEPLOY_USER=blog-deploy \
  ./ops/hetzner/bootstrap-deploy-user.sh "$(cat blog-deploy.pub)"
```

The bootstrap script:

- creates `blog-deploy` with no usable password
- allows SSH key authentication only for the deployment key
- disables SSH agent forwarding, port forwarding, X11 forwarding and PTY allocation for that key
- adds the account to the `docker` group
- creates `/opt/Blog` owned by the deployment account

## 3. GitHub secrets

Configure the production environment or repository secrets:

```text
HETZNER_HOST=<server hostname or IP>
HETZNER_USER=blog-deploy
HETZNER_SSH_KEY=<private ed25519 key>
HETZNER_KNOWN_HOSTS=<pinned SSH host key>
HETZNER_PORT=22                  # optional
```

Generate `HETZNER_KNOWN_HOSTS` from a trusted network and verify the fingerprint before storing it:

```bash
ssh-keyscan -H <server> > known_hosts
ssh-keygen -lf known_hosts
```

Do not blindly trust an unverified keyscan result.

## Security note

The account is separated from personal administrator logins, but Docker daemon access is highly privileged. Membership in the `docker` group is effectively root-equivalent on a conventional Docker installation.

For stricter privilege separation, migrate the deployment account to rootless Docker or replace direct Docker access with a narrowly scoped root-owned deployment service/script.
