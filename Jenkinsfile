pipeline {
    agent any

    environment {
        REGISTRY      = 'ghcr.io'
        IMAGE_NAME    = 'devicaro16/banking-event-sourcing'
        SONAR_HOST    = 'http://sonarqube:9000'
        GIT_REPO_URL  = 'https://github.com/DevIcaro16/event-sourcing-cqrs-kafka'
    }

    triggers {
        pollSCM('H * * * *')
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
                script {
                    env.GIT_SHORT    = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
                    env.BRANCH_NAME  = (env.GIT_BRANCH ?: '').replaceFirst('origin/', '').trim()
                    env.OVERLAY      = env.BRANCH_NAME == 'main' ? 'prod' : 'dev'
                }
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'bun install --frozen-lockfile'
            }
        }

        stage('Unit Tests + Coverage') {
            steps {
                sh 'bun run test:unit:coverage'
            }
        }

        stage('Integration Tests') {
            steps {
                sh 'KAFKA_ADVERTISED_HOST=host.docker.internal docker compose -f docker-compose.test.yml up -d --wait --wait-timeout 120'
                sh '''
                    TEST_DATABASE_URL=postgres://postgres:postgres@host.docker.internal:5433/banking_test \
                    TEST_READ_DATABASE_URL=postgres://postgres:postgres@host.docker.internal:5435/banking_read_test \
                    TEST_REDIS_URL=redis://host.docker.internal:6380 \
                    TEST_KAFKA_BROKERS=host.docker.internal:9093 \
                    bun test tests/integration
                '''
            }
            post {
                always {
                    sh 'docker compose -f docker-compose.test.yml down -v || true'
                }
            }
        }

        stage('SonarQube Analysis') {
            steps {
                withSonarQubeEnv('SonarQube') {
                    sh "sonar-scanner -Dsonar.host.url=${SONAR_HOST}"
                }
            }
        }

        stage('Build & Push Image') {
            when {
                expression { env.BRANCH_NAME == 'main' || env.BRANCH_NAME == 'develop' }
            }
            steps {
                script {
                    def fullImage = "${REGISTRY}/${IMAGE_NAME}:${GIT_SHORT}"
                    withCredentials([usernamePassword(
                        credentialsId: 'ghcr-credentials',
                        usernameVariable: 'GHCR_USER',
                        passwordVariable: 'GHCR_TOKEN'
                    )]) {
                        sh 'echo "$GHCR_TOKEN" | docker login "$REGISTRY" -u "$GHCR_USER" --password-stdin'
                        sh "docker build -t ${fullImage} ."
                        sh "docker push ${fullImage}"
                        sh "docker logout ${REGISTRY}"
                    }
                }
            }
        }

        stage('Update Manifest') {
            when {
                expression { env.BRANCH_NAME == 'main' || env.BRANCH_NAME == 'develop' }
            }
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'github-git-credentials',
                    usernameVariable: 'GIT_USER',
                    passwordVariable: 'GIT_TOKEN'
                )]) {
                    sh """
                        sed -i 's|newTag:.*|newTag: "${GIT_SHORT}"|' k8s/overlays/${OVERLAY}/kustomization.yaml
                        git config user.email "jenkins@banking-ci"
                        git config user.name "Jenkins CI"
                        git add k8s/overlays/${OVERLAY}/kustomization.yaml
                        git commit -m "ci(${OVERLAY}): update image tag to ${GIT_SHORT} [skip ci]" || true
                        git push https://${GIT_USER}:${GIT_TOKEN}@github.com/DevIcaro16/event-sourcing-cqrs-kafka.git HEAD:${BRANCH_NAME}
                    """
                }
            }
        }
    }

    post {
        always {
            sh 'docker compose -f docker-compose.test.yml down -v || true'
            cleanWs()
        }
    }
}
